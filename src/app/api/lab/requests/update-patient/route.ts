export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  requestId: z.string().uuid(),
  patient_name: z.string().min(1).max(200).optional().or(z.literal("")),
  patient_phone: z.string().max(50).optional().or(z.literal("")),
  patient_email: z.string().email().optional().or(z.literal("")),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  sex: z.enum(["male", "female", "other"]).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
});

export async function PATCH(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });

  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

  const { requestId, ...fields } = parsed.data;

  // Verify the request belongs to this lab
  const existing = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, lab_id: true, patient_email: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (existing.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  // Build update data
  const updateData: Record<string, unknown> = {};
  if (fields.patient_name !== undefined) updateData.patient_name = fields.patient_name || null;
  if (fields.patient_phone !== undefined) updateData.patient_phone = fields.patient_phone || null;
  if (fields.patient_email !== undefined) updateData.patient_email = fields.patient_email || null;
  if (fields.dob !== undefined) updateData.dob = fields.dob ? new Date(fields.dob) : null;
  if (fields.sex !== undefined) updateData.sex = fields.sex || null;
  if (fields.address !== undefined) updateData.address = fields.address || null;

  await prisma.request.update({ where: { id: requestId }, data: updateData });

  // Also update PatientProfile if email is on file (so patient portal reflects changes)
  const emailForProfile = (fields.patient_email !== undefined ? fields.patient_email : existing.patient_email) || null;
  if (emailForProfile) {
    const profileUpdate: Record<string, unknown> = {};
    if (fields.patient_name !== undefined && fields.patient_name) profileUpdate.name = fields.patient_name;
    if (fields.patient_phone !== undefined) profileUpdate.phone = fields.patient_phone || null;
    if (fields.dob !== undefined) profileUpdate.dob = fields.dob || null;
    if (fields.sex !== undefined) profileUpdate.sex = fields.sex || null;
    if (fields.address !== undefined) profileUpdate.address = fields.address || null;

    if (Object.keys(profileUpdate).length > 0) {
      await prisma.patientProfile.upsert({
        where: { email: emailForProfile.toLowerCase() },
        update: profileUpdate,
        create: { email: emailForProfile.toLowerCase(), ...profileUpdate },
      }).catch(() => null); // non-blocking
    }
  }

  return NextResponse.json({ success: true });
}
