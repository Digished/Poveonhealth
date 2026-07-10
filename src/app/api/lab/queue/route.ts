export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { markSeenWithCommission } from "@/lib/lims";
import type { Prisma } from "@prisma/client";

const QUEUE_SELECT = {
  id: true,
  code: true,
  status: true,
  source: true,
  patient_name: true,
  patient_phone: true,
  patient_email: true,
  patient_age: true,
  dob: true,
  sex: true,
  address: true,
  doctor_name: true,
  doctor_hospital: true,
  tests: true,
  diagnosis: true,
  referral_type: true,
  policy_number: true,
  whatsapp_phone: true,
  payment_mode: true,
  is_paid: true,
  quoted_price: true,
  test_breakdown: true,
  created_at: true,
  arrived_at: true,
  queue_confirmed_at: true,
  attended_at: true,
} as const;

type QueueRow = Prisma.RequestGetPayload<{ select: typeof QUEUE_SELECT }>;

function serialize(r: QueueRow) {
  return {
    ...r,
    quoted_price: r.quoted_price != null ? Number(r.quoted_price) : null,
    dob: r.dob ? r.dob.toISOString().slice(0, 10) : null,
  };
}

/**
 * GET /api/lab/queue
 * The self-service (QR) waiting queue. Registrations join the queue on
 * submission and move through simple journey stages, first-come-first-served:
 *  - waiting:  in the queue, payment not yet taken
 *  - paid:     payment taken, waiting to be attended to
 *  - attended: ticked off in the last 24h (for undo / reference)
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen && !auth.permissions.can_view_requests) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const base = { lab_id: auth.lab_id, source: "qr" };
  // A waiting queue is a same-day affair — cap the active lists at 7 days so
  // stale registrations (or pre-feature history) don't pile up forever.
  const activeSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [waiting, paid, attended] = await Promise.all([
    prisma.request.findMany({
      where: { ...base, is_paid: false, attended_at: null, status: { not: "done" }, created_at: { gt: activeSince } },
      orderBy: { created_at: "asc" },
      select: QUEUE_SELECT,
    }),
    prisma.request.findMany({
      where: { ...base, is_paid: true, attended_at: null, status: { not: "done" }, created_at: { gt: activeSince } },
      orderBy: { created_at: "asc" },
      select: QUEUE_SELECT,
    }),
    prisma.request.findMany({
      where: { ...base, attended_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { attended_at: "desc" },
      take: 100,
      select: QUEUE_SELECT,
    }),
  ]);

  return NextResponse.json({
    success: true,
    waiting: waiting.map(serialize),
    paid: paid.map(serialize),
    attended: attended.map(serialize),
  });
}

const ActionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["confirm", "mark_paid", "attend", "unattend"]),
  // Optional edits applied when saving (the lab corrects details on the queue).
  edits: z
    .object({
      patient_name: z.string().max(200).optional(),
      patient_phone: z.string().max(50).optional(),
      patient_email: z.string().max(200).optional(),
      patient_age: z.number().int().min(0).max(150).nullable().optional(),
      sex: z.string().max(20).optional(),
      tests: z.string().max(3000).optional(),
      whatsapp_phone: z.string().max(50).optional(),
      payment_mode: z.enum(["cash", "card", "transfer", "bill_hospital"]).nullable().optional(),
      referral_type: z.enum(["self", "doctor", "hmo"]).nullable().optional(),
      doctor_name: z.string().max(200).optional(),
      doctor_hospital: z.string().max(200).optional(),
      policy_number: z.string().max(100).optional(),
      diagnosis: z.string().max(1000).optional(),
    })
    .optional(),
});

/**
 * POST /api/lab/queue
 * Queue transitions: save edits for a queued client, record their payment
 * (moves them to the Paid tab and accrues commission, mirroring the
 * onboarding registration flow), tick them as attended, or undo.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  const { requestId, action, edits } = parsed.data;

  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true, lab_id: true, code: true } });
  if (!req) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  if (req.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const data: Record<string, unknown> = {};
  let activity = "";

  if (action === "confirm") {
    if (!edits) return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    data.queue_confirmed_at = new Date();
    if (edits.patient_name !== undefined) data.patient_name = edits.patient_name.trim() || null;
    if (edits.patient_phone !== undefined) data.patient_phone = edits.patient_phone.trim() || null;
    if (edits.patient_email !== undefined) data.patient_email = edits.patient_email.trim() || null;
    if (edits.patient_age !== undefined) data.patient_age = edits.patient_age;
    if (edits.sex !== undefined) data.sex = edits.sex || null;
    if (edits.tests !== undefined && edits.tests.trim()) data.tests = edits.tests.trim();
    if (edits.whatsapp_phone !== undefined) data.whatsapp_phone = edits.whatsapp_phone.trim() || null;
    if (edits.payment_mode !== undefined) data.payment_mode = edits.payment_mode;
    if (edits.referral_type !== undefined) data.referral_type = edits.referral_type;
    if (edits.doctor_name !== undefined && edits.doctor_name.trim()) data.doctor_name = edits.doctor_name.trim();
    if (edits.doctor_hospital !== undefined) data.doctor_hospital = edits.doctor_hospital.trim() || null;
    if (edits.policy_number !== undefined) data.policy_number = edits.policy_number.trim() || null;
    if (edits.diagnosis !== undefined) data.diagnosis = edits.diagnosis.trim() || null;
    activity = "queue details updated";
  } else if (action === "mark_paid") {
    data.is_paid = true;
    activity = "marked paid (queue)";
  } else if (action === "attend") {
    data.attended_at = new Date();
    activity = "marked attended";
  } else {
    data.attended_at = null;
    activity = "returned to queue";
  }

  const updated = await prisma.request.update({ where: { id: requestId }, data, select: QUEUE_SELECT });

  // Payment also promotes the request to "seen" and accrues commission —
  // identical to marking paid from the onboarding checklist.
  if (action === "mark_paid") {
    await markSeenWithCommission(requestId).catch((e) => console.error("[queue] markSeen failed:", e));
  }

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "queue_update", detail: `Request ${req.code}: ${activity}` });
  }

  return NextResponse.json({ success: true, request: serialize(updated) });
}
