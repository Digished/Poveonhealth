export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

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
  whatsapp_phone: true,
  payment_mode: true,
  is_paid: true,
  created_at: true,
  arrived_at: true,
  queue_confirmed_at: true,
  attended_at: true,
} as const;

/**
 * GET /api/lab/queue
 * The self-service (QR) waiting queue, first-come-first-served:
 *  - pending:  new QR registrations awaiting the lab's confirmation
 *  - queued:   confirmed clients waiting to be attended, in arrival order
 *  - attended: clients ticked off in the last 24h (for undo / reference)
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen && !auth.permissions.can_view_requests) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const base = { lab_id: auth.lab_id, source: "qr" };
  const [pending, queued, attended] = await Promise.all([
    prisma.request.findMany({
      where: { ...base, queue_confirmed_at: null, attended_at: null, status: { not: "done" } },
      orderBy: { created_at: "asc" },
      select: QUEUE_SELECT,
    }),
    prisma.request.findMany({
      where: { ...base, queue_confirmed_at: { not: null }, attended_at: null, status: { not: "done" } },
      orderBy: { created_at: "asc" },
      select: QUEUE_SELECT,
    }),
    prisma.request.findMany({
      where: { ...base, attended_at: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { attended_at: "desc" },
      take: 50,
      select: QUEUE_SELECT,
    }),
  ]);

  return NextResponse.json({ success: true, pending, queued, attended });
}

const ActionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["confirm", "attend", "unattend", "return_to_pending"]),
  // Optional edits applied when confirming (the lab corrects details first).
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
      diagnosis: z.string().max(1000).optional(),
    })
    .optional(),
});

/**
 * POST /api/lab/queue
 * Queue transitions: confirm a pending QR registration into the queue (with
 * optional edits), tick a client as attended, or undo either.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_mark_seen) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  const { requestId, action, edits } = parsed.data;

  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true, lab_id: true, code: true, arrived_at: true } });
  if (!req) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
  if (req.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const data: Record<string, unknown> = {};
  let activity = "";

  if (action === "confirm") {
    data.queue_confirmed_at = new Date();
    // Confirming a QR self-registration means the client is physically here.
    if (!req.arrived_at) data.arrived_at = new Date();
    if (edits) {
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
      if (edits.diagnosis !== undefined) data.diagnosis = edits.diagnosis.trim() || null;
    }
    activity = "confirmed into queue";
  } else if (action === "attend") {
    data.attended_at = new Date();
    activity = "marked attended";
  } else if (action === "unattend") {
    data.attended_at = null;
    activity = "returned to queue";
  } else {
    data.queue_confirmed_at = null;
    activity = "returned to pending";
  }

  const updated = await prisma.request.update({ where: { id: requestId }, data, select: QUEUE_SELECT });

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "queue_update", detail: `Request ${req.code}: ${activity}` });
  }

  return NextResponse.json({ success: true, request: updated });
}
