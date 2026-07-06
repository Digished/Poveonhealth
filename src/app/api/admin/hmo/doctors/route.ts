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

// Doctors involved in HMO monitoring (any coverage or direct assignment),
// with their assignments expanded for the admin UI.
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const [coverages, directs] = await Promise.all([
      prisma.hmoDoctorCoverage.findMany(),
      prisma.hmoDoctorPatient.findMany(),
    ]);

    const doctorEmails = Array.from(
      new Set([...coverages.map((c) => c.doctor_email), ...directs.map((d) => d.doctor_email)])
    );

    const [profiles, hmos, members] = await Promise.all([
      prisma.doctorProfile.findMany({
        where: { email: { in: doctorEmails } },
        select: { email: true, prefix: true, full_name: true, specialty: true, phone: true, claimed: true },
      }),
      prisma.hmo.findMany({
        where: { id: { in: coverages.map((c) => c.hmo_id) } },
        select: { id: true, name: true, code: true },
      }),
      prisma.hmoMember.findMany({
        where: { id: { in: directs.map((d) => d.member_id) } },
        select: { id: true, full_name: true, policy_number: true, hmo: { select: { name: true } } },
      }),
    ]);

    const profileMap = new Map(profiles.map((p) => [p.email, p]));
    const hmoMap = new Map(hmos.map((h) => [h.id, h]));
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const doctors = doctorEmails.map((email) => ({
      email,
      profile: profileMap.get(email) ?? null,
      hmos: coverages
        .filter((c) => c.doctor_email === email)
        .map((c) => hmoMap.get(c.hmo_id))
        .filter(Boolean),
      patients: directs
        .filter((d) => d.doctor_email === email)
        .map((d) => memberMap.get(d.member_id))
        .filter(Boolean),
    }));

    return NextResponse.json({ success: true, doctors });
  } catch (err) {
    console.error("[admin/hmo/doctors GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const CreateSchema = z.object({
  email: z.string().email(),
  prefix: z.string().max(24).optional(),
  full_name: z.string().min(2).max(120),
  specialty: z.string().max(120).optional(),
  phone: z.string().max(32).optional(),
});

// Pre-create a doctor profile (claimed=false) — the doctor activates the
// account by logging in at /doc-login with their email OTP.
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const parsed = CreateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid doctor details" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.doctorProfile.findUnique({ where: { email } });
    if (existing) {
      // Already a doctor on the platform — nothing to create, admin can
      // simply assign them.
      return NextResponse.json({ success: true, existed: true, doctor: { email } });
    }

    const doctor = await prisma.doctorProfile.create({
      data: {
        email,
        prefix: parsed.data.prefix?.trim() || "Dr.",
        full_name: parsed.data.full_name.trim(),
        specialty: parsed.data.specialty?.trim() || null,
        phone: parsed.data.phone?.trim() || null,
        claimed: false,
      },
      select: { email: true, full_name: true },
    });

    return NextResponse.json({ success: true, existed: false, doctor });
  } catch (err) {
    console.error("[admin/hmo/doctors POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
