export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/hospitals/[id]/doctors — doctors registered under a hospital */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const doctors = await prisma.hospitalDoctor.findMany({
    where: { hospital_id: id },
    orderBy: { created_at: "desc" },
  });

  const emails = doctors.map((d) => d.doctor_email);
  const profiles = emails.length
    ? await prisma.doctorProfile.findMany({
        where: { email: { in: emails } },
        select: { email: true, prefix: true, full_name: true, specialty: true, phone: true },
      })
    : [];
  const profileMap = new Map(profiles.map((p) => [p.email, p]));

  return NextResponse.json({
    success: true,
    doctors: doctors.map((d) => {
      const p = profileMap.get(d.doctor_email);
      return {
        id: d.id,
        doctor_email: d.doctor_email,
        doctor_name: p?.full_name ? `${p.prefix ? `${p.prefix} ` : ""}${p.full_name}` : d.doctor_name,
        specialty: p?.specialty ?? null,
        phone: p?.phone ?? null,
        has_profile: !!p,
        added_by: d.added_by,
        created_at: d.created_at,
      };
    }),
  });
}

const AddDoctorSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
});

/** POST /api/admin/hospitals/[id]/doctors — admin registers a doctor under a hospital */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const hospital = await prisma.hospital.findUnique({ where: { id } });
  if (!hospital) return NextResponse.json({ error: "Hospital not found" }, { status: 404 });

  const parsed = AddDoctorSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid doctor email is required." }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.hospitalDoctor.findUnique({
    where: { hospital_id_doctor_email: { hospital_id: id, doctor_email: email } },
  });
  if (existing) {
    return NextResponse.json({ error: "This doctor is already registered under this hospital." }, { status: 409 });
  }

  const doctor = await prisma.hospitalDoctor.create({
    data: {
      hospital_id: id,
      doctor_email: email,
      doctor_name: parsed.data.name?.trim() || null,
      added_by: `admin:${admin.email ?? admin.id}`,
    },
  });

  return NextResponse.json({ success: true, doctor });
}

/** DELETE /api/admin/hospitals/[id]/doctors?doctorId=... — admin removes a doctor */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get("doctorId");
  if (!doctorId) return NextResponse.json({ error: "doctorId required" }, { status: 400 });

  const doctor = await prisma.hospitalDoctor.findUnique({ where: { id: doctorId } });
  if (!doctor || doctor.hospital_id !== id) {
    return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
  }

  await prisma.hospitalDoctor.delete({ where: { id: doctorId } });
  return NextResponse.json({ success: true });
}
