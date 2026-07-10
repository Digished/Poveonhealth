export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const Schema = z.object({
  lab_id: z.string().uuid().optional(),
  lab_slug: z.string().max(120).optional(),
  code: z.string().min(1).max(50).transform((s) => s.trim().toUpperCase()),
  patient_name: z.string().min(1).max(200),
  patient_phone: z.string().min(5).max(300),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_age: z.number().int().min(0).max(150).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  sex: z.string().max(20).optional().or(z.literal("")),
  whatsapp_phone: z.string().max(300).optional().or(z.literal("")),
  payment_mode: z.enum(["cash", "card", "transfer", "bill_hospital"]).optional(),
  location_country: z.string().max(100).optional().or(z.literal("")),
  location_state: z.string().max(100).optional().or(z.literal("")),
  location_lga: z.string().max(100).optional().or(z.literal("")),
  condition: z.string().max(1000).optional().or(z.literal("")),
  consent: z.literal(true),
});

/**
 * POST /api/onboard/confirm
 * The patient confirms/corrects their own details on an existing Poveon request
 * (revealed by code on the QR page). Updates editable patient fields and records
 * consent. Tests and the referring doctor are left untouched (doctor-ordered).
 */
export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid details" }, { status: 400, headers: CORS });
  const d = parsed.data;
  if (!d.lab_id && !d.lab_slug) return NextResponse.json({ success: false, error: "Lab not specified" }, { status: 400, headers: CORS });

  const lab = d.lab_id
    ? await prisma.lab.findUnique({ where: { id: d.lab_id }, select: { id: true, slug: true } })
    : await prisma.lab.findUnique({ where: { slug: d.lab_slug! }, select: { id: true, slug: true } });
  if (!lab) return NextResponse.json({ success: false, error: "Laboratory not found" }, { status: 404, headers: CORS });

  const req = await prisma.request.findFirst({
    where: { lab_id: lab.id, OR: [{ code: d.code }, { code: { endsWith: `-${d.code}` } }] },
    select: { id: true, status: true, code: true, queue_confirmed_at: true, queue_number: true, diagnosis: true },
  });
  if (!req) return NextResponse.json({ success: false, error: "No request found with that code" }, { status: 404, headers: CORS });
  if (req.status === "done") return NextResponse.json({ success: false, error: "This request is already completed" }, { status: 409, headers: CORS });

  // Confirming details at the lab also places the client in the waiting
  // queue (first confirmation only) with a stable daily ticket number.
  let queueNumber = req.queue_number;
  let queueJoin: { queue_confirmed_at: Date; queue_number: number } | Record<string, never> = {};
  if (!req.queue_confirmed_at) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await prisma.request.count({
      where: { lab_id: lab.id, queue_confirmed_at: { gte: startOfDay } },
    });
    queueNumber = todayCount + 1;
    queueJoin = { queue_confirmed_at: new Date(), queue_number: queueNumber };
  }

  // Location → address ("LGA, State, Country"); complaint appends beneath any
  // doctor-entered diagnosis instead of overwriting it.
  const locationParts = [d.location_lga?.trim(), d.location_state?.trim(), d.location_country?.trim()].filter(Boolean);
  const complaint = d.condition?.trim() || "";
  const diagnosis = complaint
    ? (req.diagnosis && !req.diagnosis.includes(complaint) ? `${req.diagnosis}\nClient complaint: ${complaint}` : req.diagnosis || complaint)
    : undefined;

  await prisma.request.update({
    where: { id: req.id },
    data: {
      patient_name: d.patient_name,
      patient_phone: d.patient_phone,
      patient_email: d.patient_email?.trim() || null,
      patient_age: d.patient_age ?? null,
      dob: d.dob?.trim() ? new Date(d.dob.trim() + "T00:00:00Z") : undefined,
      sex: d.sex || null,
      whatsapp_phone: d.whatsapp_phone?.trim() || null,
      payment_mode: d.payment_mode ?? undefined,
      ...(locationParts.length > 0 ? { address: locationParts.join(", ") } : {}),
      ...(diagnosis !== undefined ? { diagnosis } : {}),
      consent_at: new Date(),
      arrived_at: new Date(), // confirming on-site means the client is here
      ...queueJoin,
    },
  });

  return NextResponse.json(
    {
      success: true,
      code: req.code,
      queue_number: queueNumber,
      status_path: lab.slug ? `/o/${lab.slug}/q/${req.code}` : null,
    },
    { headers: CORS }
  );
}
