export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";

/** GET /api/hospital/doctors — list doctors registered under this hospital */
export async function GET(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const doctors = await prisma.hospitalDoctor.findMany({
      where: { hospital_id: hospital.id },
      orderBy: { created_at: "desc" },
    });

    // Enrich with profile data where the doctor already has a Poveon profile
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
          created_at: d.created_at,
        };
      }),
    });
  } catch (err) {
    console.error("[hospital/doctors GET]", err);
    return NextResponse.json({ error: "Failed to load doctors." }, { status: 500 });
  }
}

const AddDoctorSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).optional(),
});

/** POST /api/hospital/doctors — register a doctor so they can send referrals */
export async function POST(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = AddDoctorSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid doctor email is required." }, { status: 400 });
    }
    const email = parsed.data.email.trim().toLowerCase();

    const existing = await prisma.hospitalDoctor.findUnique({
      where: { hospital_id_doctor_email: { hospital_id: hospital.id, doctor_email: email } },
    });
    if (existing) {
      return NextResponse.json({ error: "This doctor is already registered." }, { status: 409 });
    }

    const doctor = await prisma.hospitalDoctor.create({
      data: {
        hospital_id: hospital.id,
        doctor_email: email,
        doctor_name: parsed.data.name?.trim() || null,
        added_by: hospital.email ?? hospital.name,
      },
    });

    return NextResponse.json({ success: true, doctor });
  } catch (err) {
    console.error("[hospital/doctors POST]", err);
    return NextResponse.json({ error: "Failed to add doctor." }, { status: 500 });
  }
}

/** DELETE /api/hospital/doctors?id=... — remove a doctor from this hospital */
export async function DELETE(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Doctor id required." }, { status: 400 });

    const doctor = await prisma.hospitalDoctor.findUnique({ where: { id } });
    if (!doctor || doctor.hospital_id !== hospital.id) {
      return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
    }

    await prisma.hospitalDoctor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[hospital/doctors DELETE]", err);
    return NextResponse.json({ error: "Failed to remove doctor." }, { status: 500 });
  }
}
