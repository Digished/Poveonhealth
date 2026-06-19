export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { renderResultPdf } from "@/lib/result-render";
import { createAdminClient } from "@/lib/supabase/server";
import { resend, labSender } from "@/lib/email/resend";
import { labResultsDoctor, labResultsPatient } from "@/lib/email/templates";

const RESULTS_BUCKET = "lab-results";

const Schema = z.object({ send: z.boolean().optional() });

/**
 * POST /api/lab/results/[id]/report
 * Renders the result PDF, stores it on the lab-results bucket, attaches it to the
 * request's result files, marks the result reported, and (if send=true) emails
 * the patient/doctor. Requires can_send_results.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_send_results) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { send } = Schema.parse(body ?? {});

  const result = await prisma.requestResult.findUnique({
    where: { id: params.id },
    include: { request: { include: { lab: { select: { name: true, notification_email: true } } } } },
  });
  if (!result || result.lab_id !== auth.lab_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (auth.department && result.department && auth.department !== result.department) {
    return NextResponse.json({ error: "Your role is limited to the " + auth.department + " department" }, { status: 403 });
  }

  const rendered = await renderResultPdf(result.id, auth.lab_id);
  if (!rendered) return NextResponse.json({ error: "Could not render report" }, { status: 500 });

  // Upload PDF to the lab-results bucket.
  const supabaseAdmin = await createAdminClient();
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.find((b) => b.name === RESULTS_BUCKET)) {
    await supabaseAdmin.storage.createBucket(RESULTS_BUCKET, { public: true });
  }
  const path = `${result.request_id}/result-${result.id}-${Date.now()}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage.from(RESULTS_BUCKET).upload(path, rendered.buffer, { contentType: "application/pdf", upsert: true });
  if (upErr) return NextResponse.json({ error: "Upload failed: " + upErr.message }, { status: 500 });
  const { data: { publicUrl } } = supabaseAdmin.storage.from(RESULTS_BUCKET).getPublicUrl(path);

  // Mark reported + attach to the request's result files.
  await prisma.requestResult.update({ where: { id: result.id }, data: { status: "reported", pdf_url: publicUrl, verified_at: result.verified_at ?? new Date(), verified_by: result.verified_by ?? auth.actor_email ?? null } });
  const req = result.request;
  const fileUrls = Array.from(new Set([...(req.result_file_urls ?? []), publicUrl]));
  await prisma.request.update({
    where: { id: req.id },
    data: { result_file_urls: fileUrls, ...(req.status !== "done" ? { status: "done", completed_at: new Date() } : {}) },
  });

  // Optionally email patient + doctor with the PDF attached.
  if (send) {
    const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;
    const attachments = [{ filename: `result-${rendered.code}.pdf`, content: rendered.buffer }];
    if (req.patient_email) {
      resend.emails.send({ from: labSender(req.lab), to: req.patient_email, subject: "Your Lab Results Are Ready", html: labResultsPatient({ patientName: req.patient_name ?? "Patient", labName: req.lab.name, hasAttachment: true, brand }), attachments }).catch((e) => console.error("[result-report] patient email:", e));
    }
    if (req.doctor_email) {
      resend.emails.send({ from: labSender(req.lab), to: req.doctor_email, subject: `Lab Results Available — ${req.patient_name ?? "Patient"}`, html: labResultsDoctor({ doctorName: req.doctor_name, patientName: req.patient_name ?? "Patient", labName: req.lab.name, code: req.code, hasAttachment: true, brand }), attachments }).catch((e) => console.error("[result-report] doctor email:", e));
    }
  }

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: send ? "results_sent" : "result_reported", detail: `Result report for ${rendered.code}${send ? " sent" : " generated"}` });

  return NextResponse.json({ success: true, pdf_url: publicUrl, sent: !!send });
}
