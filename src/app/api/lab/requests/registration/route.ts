export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { markSeenWithCommission } from "@/lib/lims";
import { resend, labSender } from "@/lib/email/resend";
import { patientArrivedSelfService } from "@/lib/email/templates";

const Schema = z.object({
  requestId: z.string().uuid(),
  tests_confirmed: z.boolean().optional(),
  is_paid: z.boolean().optional(),
  arrived: z.boolean().optional(),
  // Email the client their self-registration link (code pre-applied).
  send_registration_link: z.boolean().optional(),
  // Confirmed / corrected email to send the link to (also saved on the request).
  email: z.string().email().optional(),
});

/**
 * POST /api/lab/requests/registration
 * Records the registration gate flags — staff confirm the tests and mark the
 * client as paid before the request can move down the pipeline. Marking paid
 * also promotes the request to "seen" (and accrues commission). Requires
 * can_mark_seen.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  const { requestId, tests_confirmed, is_paid, arrived, send_registration_link, email } = parsed.data;

  const req = await prisma.request.findUnique({
    where: { id: requestId },
    select: {
      id: true, lab_id: true, code: true, source: true,
      patient_name: true, patient_email: true, arrived_at: true,
      lab: { select: { name: true, slug: true, notification_email: true } },
    },
  });
  if (!req) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  if (req.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const data: Record<string, unknown> = {};
  if (tests_confirmed !== undefined) data.tests_confirmed = tests_confirmed;
  if (is_paid !== undefined) data.is_paid = is_paid;
  if (arrived !== undefined) data.arrived_at = arrived ? new Date() : null;
  if (send_registration_link && email) data.patient_email = email.trim().toLowerCase();
  if (Object.keys(data).length === 0 && !send_registration_link) {
    return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
  }

  if (Object.keys(data).length > 0) {
    await prisma.request.update({ where: { id: requestId }, data });
  }

  // Marking the client as paid also marks the request seen + accrues commission.
  if (is_paid === true) {
    await markSeenWithCommission(requestId).catch((e) => console.error("[registration] markSeen failed:", e));
  }

  // "Register client" emails the client their self-registration link with the
  // code pre-applied — the form auto-fills their referral details (referring
  // doctor stays locked). Completing it places them in the queue from that
  // moment.
  const sendTo = send_registration_link ? (email?.trim().toLowerCase() || req.patient_email) : null;
  if (send_registration_link) {
    if (!sendTo) return NextResponse.json({ success: false, error: "No email on file for this client — enter one first" }, { status: 400 });
    if (!req.lab.slug) return NextResponse.json({ success: false, error: "Set a public URL slug for your lab to enable self-registration links" }, { status: 400 });
  }
  if (send_registration_link && sendTo && req.lab.slug) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
    const selfServiceUrl = `${appUrl}/o/${req.lab.slug}?code=${encodeURIComponent(req.code)}`;
    resend.emails
      .send({
        from: labSender(req.lab),
        to: sendTo,
        subject: `${req.lab.name} — complete your registration`,
        html: patientArrivedSelfService({
          patientName: req.patient_name ?? "there",
          labName: req.lab.name,
          code: req.code,
          selfServiceUrl,
          brand: req.lab.notification_email ? { name: req.lab.name } : undefined,
        }),
      })
      .then(({ error }) => { if (error) console.error("[registration] arrived email:", JSON.stringify(error)); })
      .catch((e) => console.error("[registration] arrived email failed:", e));
  }

  if (auth.actor_email) {
    const parts = [tests_confirmed !== undefined ? `tests ${tests_confirmed ? "confirmed" : "unconfirmed"}` : null, is_paid !== undefined ? (is_paid ? "marked paid" : "marked unpaid") : null, arrived !== undefined ? (arrived ? "marked arrived" : "arrival cleared") : null, send_registration_link ? "registration link sent" : null].filter(Boolean).join(", ");
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "request_registration", detail: `Request ${req.code}: ${parts}` });
  }

  return NextResponse.json({ success: true });
}
