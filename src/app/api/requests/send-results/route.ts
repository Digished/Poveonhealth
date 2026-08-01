export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { resend, labSender } from "@/lib/email/resend";
import { labResultsDoctor, labResultsPatient } from "@/lib/email/templates";
import { logApiCall } from "@/lib/api-logger";
import { logLabActivity } from "@/lib/lab-activity";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { waTemplates } from "@/lib/whatsapp";

const RESULTS_BUCKET = "lab-results";

async function uploadResultFile(supabaseAdmin: Awaited<ReturnType<typeof createAdminClient>>, requestId: string, file: File, index: number): Promise<string | null> {
  try {
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `${requestId}/${index}-${Date.now()}.${ext}`;
    const bytes = await file.arrayBuffer();
    const { error } = await supabaseAdmin.storage.from(RESULTS_BUCKET).upload(path, bytes, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
    if (error) { console.error("[send-results] upload error:", error.message); return null; }
    const { data: { publicUrl } } = supabaseAdmin.storage.from(RESULTS_BUCKET).getPublicUrl(path);
    return publicUrl;
  } catch (e) {
    console.error("[send-results] upload exception:", e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const formData = await request.formData();

    const requestId = formData.get("requestId") as string | null;
    const resultLink = (formData.get("resultLink") as string | null)?.trim() || undefined;
    const note = (formData.get("note") as string | null)?.trim() || undefined;
    const patientEmailOverride = (formData.get("patientEmail") as string | null)?.trim() || undefined;

    const rawFiles = formData.getAll("resultFiles");
    const resultFiles = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

    if (!requestId) {
      return NextResponse.json({ success: false, error: "requestId is required" }, { status: 400 });
    }
    if (resultFiles.length === 0 && !resultLink) {
      return NextResponse.json({ success: false, error: "At least one PDF attachment or a result link is required" }, { status: 400 });
    }

    const MAX_FILES = 5;
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (resultFiles.length > MAX_FILES) return NextResponse.json({ success: false, error: "Maximum 5 files allowed" }, { status: 400 });
    const oversized = resultFiles.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) return NextResponse.json({ success: false, error: "Each file must be under 10MB" }, { status: 400 });

    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    if (!auth.permissions.can_send_results) return NextResponse.json({ success: false, error: "You do not have permission to send results" }, { status: 403 });

    const req = await prisma.request.findUnique({
      where: { id: requestId },
      include: { lab: { select: { name: true, notification_email: true, request_email: true, whatsapp: true } } },
    });
    if (!req) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    if (req.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    if (req.status === "incoming") return NextResponse.json({ success: false, error: "Patient must be seen before results can be sent" }, { status: 400 });

    // Upload files to Supabase Storage and collect public URLs
    let uploadedUrls: string[] = req.result_file_urls ?? [];
    if (resultFiles.length > 0) {
      const supabaseAdmin = await createAdminClient();
      // Ensure bucket exists
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (!buckets?.find((b) => b.name === RESULTS_BUCKET)) {
        await supabaseAdmin.storage.createBucket(RESULTS_BUCKET, { public: true });
      }
      const newUrls = await Promise.all(
        resultFiles.map((f, i) => uploadResultFile(supabaseAdmin, requestId, f, (uploadedUrls.length + i)))
      );
      uploadedUrls = [...uploadedUrls, ...newUrls.filter((u): u is string => u !== null)];
    }

    await prisma.request.update({
      where: { id: requestId },
      data: {
        ...(req.status === "seen" ? { status: "done", completed_at: new Date() } : {}),
        ...(resultLink ? { result_link: resultLink } : {}),
        ...(note ? { result_note: note } : {}),
        result_file_urls: uploadedUrls,
      },
    });

    // Build email attachments from uploaded PDFs (still attach for email delivery)
    const attachments: { filename: string; content: Buffer }[] = await Promise.all(
      resultFiles.map(async (f) => ({
        filename: f.name || "lab-results.pdf",
        content: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const hasAttachment = attachments.length > 0;
    const patientEmail = patientEmailOverride || req.patient_email || undefined;
    const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;

    if (req.doctor_email) resend.emails.send({
      from: labSender(req.lab),
      to: req.doctor_email,
      subject: `Lab Results Available — ${req.patient_name ?? "Patient"}`,
      html: labResultsDoctor({ doctorName: req.doctor_name, patientName: req.patient_name ?? "Patient", labName: req.lab.name, code: req.code, resultLink, hasAttachment, note, brand }),
      ...(attachments.length > 0 ? { attachments } : {}),
    }).catch((e) => console.error("[email] results to doctor:", e));

    if (patientEmail) {
      resend.emails.send({
        from: labSender(req.lab),
        to: patientEmail,
        subject: "Your Lab Results Are Ready",
        html: labResultsPatient({ patientName: req.patient_name ?? "Patient", labName: req.lab.name, resultLink, hasAttachment, brand }),
        ...(attachments.length > 0 ? { attachments } : {}),
      }).catch((e) => console.error("[email] results to patient:", e));
    }

    // WhatsApp nudge that results are ready. Deliberately carries no clinical
    // content and no attachment — only the code and the link — so a shared or
    // stolen phone never exposes the results themselves. The report stays in
    // email, behind the recipient's own inbox.
    const resultsNotices: Promise<unknown>[] = [];

    if (req.patient_phone) {
      resultsNotices.push(
        notify({
          phone: req.patient_phone,
          whatsapp: waTemplates.resultsReady({
            recipientName: req.patient_name,
            patientName: req.patient_name ?? "Patient",
            labName: req.lab.name,
            code: req.code,
            resultLink,
          }),
          requestId: req.id,
          tag: "results-patient",
        })
      );
    }

    if (req.doctor_phone) {
      resultsNotices.push(
        notify({
          phone: req.doctor_phone,
          whatsapp: waTemplates.resultsReady({
            recipientName: req.doctor_name,
            patientName: req.patient_name ?? "Patient",
            labName: req.lab.name,
            code: req.code,
            resultLink,
            isDoctor: true,
          }),
          requestId: req.id,
          tag: "results-doctor",
        })
      );
    }

    await Promise.all(resultsNotices).catch((e) => console.error("[send-results] WhatsApp notice error:", e));

    try {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && auth.auth_method !== "api_key") {
        logLabActivity({ lab_id: req.lab_id, actor_email: user.email ?? "unknown", actor_role: user.user_metadata?.role === "lab" ? "owner" : "member", action: "results_sent", detail: `Results sent for ${req.patient_name ?? "patient"} (${req.code})` });
      }
    } catch { /* non-critical */ }

    logApiCall({ method: "POST", path: "/api/requests/send-results", status: 200, lab_id: req.lab_id, duration_ms: Date.now() - start });
    return NextResponse.json({ success: true, status: req.status === "seen" ? "done" : req.status, result_file_urls: uploadedUrls });
  } catch (error) {
    console.error("Send results error:", error);
    logApiCall({ method: "POST", path: "/api/requests/send-results", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
