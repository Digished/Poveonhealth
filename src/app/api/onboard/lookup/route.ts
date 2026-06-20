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
});

/**
 * POST /api/onboard/lookup
 * Public reveal of a Poveon request by its code so the patient can confirm
 * their details on the QR self-registration page. The code is the secret;
 * lookups are scoped to the lab and accept the code with or without the prefix.
 * Only the editable patient fields + read-only tests/doctor are returned.
 */
export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid code" }, { status: 400, headers: CORS });
  const { lab_id, lab_slug, code } = parsed.data;
  if (!lab_id && !lab_slug) return NextResponse.json({ success: false, error: "Lab not specified" }, { status: 400, headers: CORS });

  const lab = lab_id
    ? await prisma.lab.findUnique({ where: { id: lab_id }, select: { id: true } })
    : await prisma.lab.findUnique({ where: { slug: lab_slug! }, select: { id: true } });
  if (!lab) return NextResponse.json({ success: false, error: "Laboratory not found" }, { status: 404, headers: CORS });

  const req = await prisma.request.findFirst({
    where: { lab_id: lab.id, OR: [{ code }, { code: { endsWith: `-${code}` } }] },
    select: {
      code: true, status: true, is_paid: true,
      patient_name: true, patient_phone: true, patient_email: true, patient_age: true, sex: true,
      tests: true, doctor_name: true,
    },
  });
  if (!req) return NextResponse.json({ success: false, error: "No request found with that code" }, { status: 404, headers: CORS });
  if (req.status === "done") return NextResponse.json({ success: false, error: "This request is already completed" }, { status: 409, headers: CORS });

  return NextResponse.json({ success: true, request: req }, { headers: CORS });
}
