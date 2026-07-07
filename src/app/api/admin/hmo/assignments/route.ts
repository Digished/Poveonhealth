export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BodySchema = z
  .object({
    doctor_email: z.string().email(),
    hmo_id: z.string().uuid().optional(),
    member_id: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.hmo_id) !== Boolean(d.member_id), {
    message: "Provide exactly one of hmo_id or member_id",
  });

// Assign a doctor to a whole HMO roster or to an individual member
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid assignment" },
        { status: 400 }
      );
    }
    const doctorEmail = parsed.data.doctor_email.trim().toLowerCase();

    const doctor = await prisma.doctorProfile.findUnique({ where: { email: doctorEmail } });
    if (!doctor) {
      return NextResponse.json(
        { error: "No doctor with that email — create the doctor first." },
        { status: 404 }
      );
    }

    if (parsed.data.hmo_id) {
      const hmo = await prisma.hmo.findUnique({ where: { id: parsed.data.hmo_id } });
      if (!hmo) return NextResponse.json({ error: "HMO not found" }, { status: 404 });
      await prisma.hmoDoctorCoverage.upsert({
        where: { doctor_email_hmo_id: { doctor_email: doctorEmail, hmo_id: hmo.id } },
        update: {},
        create: { doctor_email: doctorEmail, hmo_id: hmo.id },
      });
    } else {
      const member = await prisma.hmoMember.findUnique({ where: { id: parsed.data.member_id! } });
      if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
      await prisma.hmoDoctorPatient.upsert({
        where: { doctor_email_member_id: { doctor_email: doctorEmail, member_id: member.id } },
        update: {},
        create: { doctor_email: doctorEmail, member_id: member.id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/hmo/assignments POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const parsed = BodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid assignment" },
        { status: 400 }
      );
    }
    const doctorEmail = parsed.data.doctor_email.trim().toLowerCase();

    if (parsed.data.hmo_id) {
      await prisma.hmoDoctorCoverage.deleteMany({
        where: { doctor_email: doctorEmail, hmo_id: parsed.data.hmo_id },
      });
    } else {
      await prisma.hmoDoctorPatient.deleteMany({
        where: { doctor_email: doctorEmail, member_id: parsed.data.member_id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/hmo/assignments DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
