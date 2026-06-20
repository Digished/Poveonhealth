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
  patient_phone: z.string().min(5).max(50),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_age: z.number().int().min(0).max(150).optional(),
  sex: z.string().max(20).optional().or(z.literal("")),
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
    ? await prisma.lab.findUnique({ where: { id: d.lab_id }, select: { id: true } })
    : await prisma.lab.findUnique({ where: { slug: d.lab_slug! }, select: { id: true } });
  if (!lab) return NextResponse.json({ success: false, error: "Laboratory not found" }, { status: 404, headers: CORS });

  const req = await prisma.request.findFirst({
    where: { lab_id: lab.id, OR: [{ code: d.code }, { code: { endsWith: `-${d.code}` } }] },
    select: { id: true, status: true, code: true },
  });
  if (!req) return NextResponse.json({ success: false, error: "No request found with that code" }, { status: 404, headers: CORS });
  if (req.status === "done") return NextResponse.json({ success: false, error: "This request is already completed" }, { status: 409, headers: CORS });

  await prisma.request.update({
    where: { id: req.id },
    data: {
      patient_name: d.patient_name,
      patient_phone: d.patient_phone,
      patient_email: d.patient_email?.trim() || null,
      patient_age: d.patient_age ?? null,
      sex: d.sex || null,
      consent_at: new Date(),
    },
  });

  return NextResponse.json({ success: true, code: req.code }, { headers: CORS });
}
