import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("scale_token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const session = await prisma.marketerSession.findUnique({
      where: { id: token },
      include: { marketer: true },
    });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { doctor_email } = await req.json();
    if (!doctor_email) {
      return NextResponse.json({ error: "Doctor email required" }, { status: 400 });
    }

    const marketer = session.marketer;

    // Check if doctor profile exists
    const profile = await prisma.doctorProfile.findUnique({
      where: { email: doctor_email },
      select: {
        email: true,
        prefix: true,
        full_name: true,
        phone: true,
        hospitals: true,
        claimed: true,
      },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Doctor profile not found" },
        { status: 404 }
      );
    }

    // Get labs this marketer is assigned to
    const labMarketerAssignments = await prisma.labMarketer.findMany({
      where: { marketer_id: marketer.id },
      select: { lab_id: true },
    });
    const assignedLabIds = labMarketerAssignments.map((lm) => lm.lab_id);

    // Check if already linked to any marketer in the same lab
    if (assignedLabIds.length > 0) {
      const existingLink = await prisma.doctorMarketerLink.findFirst({
        where: { doctor_email },
        include: {
          marketer: {
            include: {
              lab_marketers: {
                where: { lab_id: { in: assignedLabIds } },
              },
            },
          },
        },
      });

      if (existingLink && existingLink.marketer.lab_marketers.length > 0) {
        return NextResponse.json(
          { error: `Doctor already assigned to marketer "${existingLink.marketer.name}" in this lab` },
          { status: 409 }
        );
      }
    }

    // Upsert doctor-marketer link (assign or update)
    const link = await prisma.doctorMarketerLink.upsert({
      where: {
        doctor_email,
      },
      update: {
        marketer_id: marketer.id,
      },
      create: {
        doctor_email,
        marketer_id: marketer.id,
      },
    });

    return NextResponse.json({
      success: true,
      doctor: {
        email: profile.email,
        full_name: profile.full_name,
        phone: profile.phone,
        hospitals: profile.hospitals,
      },
    });
  } catch (err) {
    console.error("[scale/doctors/assign-to-self]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
