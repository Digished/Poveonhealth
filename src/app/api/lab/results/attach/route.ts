export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { createAdminClient } from "@/lib/supabase/server";
import { resend, labSender } from "@/lib/email/resend";
import { labResultsDoctor, labResultsPatient } from "@/lib/email/templates";

const RESULTS_BUCKET = "lab-results";

/**
 * POST /api/lab/results/attach  (multipart/form-data)
 * Alternative to the parameter editor: deliver a result either as an uploaded
 * document (file) or an external link. Creates a reported RequestResult, marks
 * the request done, and (if send=true & permitted) emails the patient/doctor.
 *
 * Fields: request_id, department?, kind=document|link, file? (document),
 *         url? (link), send=true|false
 * Requires can_mark_done; sending additionally requires can_send_results.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_done) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const requestId = String(form.get("request_id") ?? "");
  const department = (form.get("department") ? String(form.get("department")) : null) || null;
  const kind = String(form.get("kind") ?? "");
  const url = form.get("url") ? String(form.get("url")) : "";
  const send = String(form.get("send") ?? "false") === "true";
  const file = form.get("file");

  if (!requestId) return NextResponse.json({ error: "request_id is required" }, { status: 400 });
  if (kind !== "document" && kind !== "link") return NextResponse.json({ error: "kind must be 'document' or 'link'" }, { status: 400 });

  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { lab: { select: { name: true, notification_email: true } } },
  });
  if (!req || req.lab_id !== auth.lab_id) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (auth.department && department && auth.department !== department) {
    return NextResponse.json({ error: "Your role is limited to the " + auth.department + " department" }, { status: 403 });
  }

  let resultUrl = "";
  let pdfUrl: string | null = null;
  let externalUrl: string | null = null;
  let attachmentBuffer: Buffer | null = null;
  let attachmentName = "";

  if (kind === "link") {
    try { new URL(url); } catch { return NextResponse.json({ error: "Enter a valid URL" }, { status: 400 }); }
    resultUrl = url;
    externalUrl = url;
  } else {
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a file" }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    attachmentBuffer = buf;
    attachmentName = file.name || `result-${req.code}`;

    const supabaseAdmin = await createAdminClient();
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    if (!buckets?.find((b) => b.name === RESULTS_BUCKET)) {
      await supabaseAdmin.storage.createBucket(RESULTS_BUCKET, { public: true });
    }
    const safeName = attachmentName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${requestId}/doc-${Date.now()}-${safeName}`;
    const { error: upErr } = await supabaseAdmin.storage.from(RESULTS_BUCKET).upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: true });
    if (upErr) return NextResponse.json({ error: "Upload failed: " + upErr.message }, { status: 500 });
    const { data: { publicUrl } } = supabaseAdmin.storage.from(RESULTS_BUCKET).getPublicUrl(path);
    resultUrl = publicUrl;
    pdfUrl = publicUrl;
  }

  const result = await prisma.requestResult.create({
    data: {
      lab_id: auth.lab_id,
      request_id: requestId,
      department,
      kind,
      external_url: externalUrl,
      pdf_url: pdfUrl,
      values: [],
      status: "reported",
      verified_by: auth.actor_email ?? null,
      verified_at: new Date(),
    },
  });

  // Attach to the request's result files and close it out.
  const fileUrls = Array.from(new Set([...(req.result_file_urls ?? []), resultUrl]));
  await prisma.request.update({
    where: { id: requestId },
    data: { result_file_urls: fileUrls, ...(req.status !== "done" ? { status: "done", completed_at: new Date() } : {}) },
  });

  let sent = false;
  if (send && auth.permissions.can_send_results) {
    const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;
    const attachments = attachmentBuffer ? [{ filename: attachmentName, content: attachmentBuffer }] : undefined;
    if (req.patient_email) {
      resend.emails.send({
        from: labSender(req.lab), to: req.patient_email, subject: "Your Lab Results Are Ready",
        html: labResultsPatient({ patientName: req.patient_name ?? "Patient", labName: req.lab.name, resultLink: resultUrl, hasAttachment: !!attachments, brand }),
        attachments,
      }).catch((e) => console.error("[result-attach] patient email:", e));
    }
    if (req.doctor_email) {
      resend.emails.send({
        from: labSender(req.lab), to: req.doctor_email, subject: `Lab Results Available — ${req.patient_name ?? "Patient"}`,
        html: labResultsDoctor({ doctorName: req.doctor_name, patientName: req.patient_name ?? "Patient", labName: req.lab.name, code: req.code, resultLink: resultUrl, hasAttachment: !!attachments, brand }),
        attachments,
      }).catch((e) => console.error("[result-attach] doctor email:", e));
    }
    sent = true;
  }

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: sent ? "results_sent" : "result_reported", detail: `${kind === "link" ? "Link" : "Document"} result for ${req.code}${sent ? " sent" : ""}` });
  }

  return NextResponse.json({ success: true, result, url: resultUrl, sent });
}
