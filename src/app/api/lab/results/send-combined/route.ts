export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { renderResultsPdf } from "@/lib/result-render";
import { sendResultToMirth } from "@/lib/hl7/send";
import { createAdminClient } from "@/lib/supabase/server";
import { resend, labSender } from "@/lib/email/resend";
import { labResultsDoctor, labResultsPatient } from "@/lib/email/templates";

const RESULTS_BUCKET = "lab-results";
const Schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(30),
  send: z.boolean().optional(),
  verify_only: z.boolean().optional(), // set analyst/verifier + mark verified, no report/email
  analyst_id: z.string().uuid().optional(),
  verifier_id: z.string().uuid().optional(),
});

/**
 * POST /api/lab/results/send-combined
 * Verify + report multiple results for one request as a single combined branded
 * PDF, attach it to the request, optionally email the patient/doctor once, and
 * push each result to Mirth. Requires can_send_results.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_send_results) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { ids, send, verify_only, analyst_id, verifier_id } = parsed.data;

  // Resolve analyst / verifier from the lab's staff (name + signature snapshot).
  const signerIds = [analyst_id, verifier_id].filter(Boolean) as string[];
  const signers = signerIds.length
    ? await prisma.labMember.findMany({ where: { id: { in: signerIds }, lab_id: auth.lab_id }, select: { id: true, name: true, email: true, signature_url: true } })
    : [];
  const signerName = (id?: string) => { const m = signers.find((s) => s.id === id); return m ? (m.name || m.email || null) : null; };
  const signerSig = (id?: string) => signers.find((s) => s.id === id)?.signature_url ?? null;
  const analystName = signerName(analyst_id);
  const verifierName = signerName(verifier_id);
  const signFields = {
    ...(analyst_id ? { analyst_name: analystName, analyst_signature_url: signerSig(analyst_id) } : {}),
    ...(verifier_id ? { verifier_name: verifierName, verifier_signature_url: signerSig(verifier_id) } : {}),
  };

  const results = await prisma.requestResult.findMany({
    where: { id: { in: ids }, lab_id: auth.lab_id },
    include: { request: { include: { lab: { select: { name: true, notification_email: true } } } } },
  });
  if (results.length === 0) return NextResponse.json({ error: "No results found" }, { status: 404 });
  const req = results[0].request;
  if (!results.every((r) => r.request_id === req.id)) return NextResponse.json({ error: "Results span different requests" }, { status: 400 });

  // Department scoping for departmental members.
  if (auth.department && !results.every((r) => !r.department || r.department === auth.department)) {
    return NextResponse.json({ error: "Your role is limited to the " + auth.department + " department" }, { status: 403 });
  }

  // Mark each result verified and stamp the analyst / verifier (name + signature).
  const now = new Date();
  for (const r of results) {
    await prisma.requestResult.update({
      where: { id: r.id },
      data: {
        ...(r.status === "draft" ? { status: "verified", verified_at: r.verified_at ?? now } : {}),
        verified_by: verifierName ?? r.verified_by ?? auth.actor_email ?? null,
        ...signFields,
      },
    });
  }

  // Verify-only: analyst/verifier captured, results verified — stop before report.
  if (verify_only) {
    if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "results_verified", detail: `${results.length} result(s) for ${req.code}` });
    return NextResponse.json({ success: true, verified: true, count: results.length });
  }

  const rendered = await renderResultsPdf(results.map((r) => r.id), auth.lab_id);
  if (!rendered) return NextResponse.json({ error: "Could not render combined report" }, { status: 500 });

  // Upload the combined PDF.
  const supabaseAdmin = await createAdminClient();
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.find((b) => b.name === RESULTS_BUCKET)) {
    await supabaseAdmin.storage.createBucket(RESULTS_BUCKET, { public: true });
  }
  const path = `${req.id}/results-${Date.now()}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage.from(RESULTS_BUCKET).upload(path, rendered.buffer, { contentType: "application/pdf", upsert: true });
  if (upErr) return NextResponse.json({ error: "Upload failed: " + upErr.message }, { status: 500 });
  const { data: { publicUrl } } = supabaseAdmin.storage.from(RESULTS_BUCKET).getPublicUrl(path);

  // Mark all results reported + attach the combined PDF to the request.
  await prisma.requestResult.updateMany({ where: { id: { in: results.map((r) => r.id) } }, data: { status: "reported", pdf_url: publicUrl } });
  const fileUrls = Array.from(new Set([...(req.result_file_urls ?? []), publicUrl]));
  await prisma.request.update({
    where: { id: req.id },
    data: { result_file_urls: fileUrls, ...(req.status !== "done" ? { status: "done", completed_at: now } : {}) },
  });

  // Email once with the combined PDF attached.
  if (send) {
    const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;
    const attachments = [{ filename: `results-${rendered.code}.pdf`, content: rendered.buffer }];
    if (req.patient_email) {
      resend.emails.send({ from: labSender(req.lab), to: req.patient_email, subject: "Your Lab Results Are Ready", html: labResultsPatient({ patientName: req.patient_name ?? "Patient", labName: req.lab.name, hasAttachment: true, brand }), attachments }).catch((e) => console.error("[send-combined] patient email:", e));
    }
    if (req.doctor_email) {
      resend.emails.send({ from: labSender(req.lab), to: req.doctor_email, subject: `Lab Results Available — ${req.patient_name ?? "Patient"}`, html: labResultsDoctor({ doctorName: req.doctor_name, patientName: req.patient_name ?? "Patient", labName: req.lab.name, code: req.code, hasAttachment: true, brand }), attachments }).catch((e) => console.error("[send-combined] doctor email:", e));
    }
  }

  // Push each result to Mirth (fire-and-forget).
  for (const r of results) sendResultToMirth(r.id, auth.lab_id).catch((e) => console.error("[send-combined] mirth:", e));

  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: send ? "results_sent" : "results_reported", detail: `${results.length} result(s) for ${req.code}${send ? " sent" : ""}` });

  return NextResponse.json({ success: true, pdf_url: publicUrl, count: results.length, sent: !!send });
}
