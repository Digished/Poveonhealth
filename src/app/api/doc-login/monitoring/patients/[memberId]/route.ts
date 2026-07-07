export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorFromRequest, doctorCoversMember } from "@/lib/hmo/auth";

// Full vitals history + alerts for one monitored member.
export async function GET(
  req: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const doctor = await getDoctorFromRequest(req);
    if (!doctor) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const member = await prisma.hmoMember.findUnique({
      where: { id: params.memberId },
      include: { hmo: { select: { name: true, code: true } } },
    });
    if (!member) {
      return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }
    if (!(await doctorCoversMember(doctor.doctor_email, member))) {
      return NextResponse.json({ error: "You are not assigned to this patient." }, { status: 403 });
    }

    const [readings, alerts] = await Promise.all([
      prisma.hmoVitalsReading.findMany({
        where: { member_id: member.id },
        orderBy: { recorded_at: "desc" },
        take: 200,
      }),
      prisma.hmoVitalsAlert.findMany({
        where: { member_id: member.id },
        orderBy: { created_at: "desc" },
        take: 100,
      }),
    ]);

    return NextResponse.json({
      success: true,
      patient: {
        id: member.id,
        full_name: member.full_name,
        email: member.email,
        policy_number: member.policy_number,
        phone: member.phone,
        date_of_birth: member.date_of_birth,
        sex: member.sex,
        hmo_name: member.hmo.name,
        flagged: member.flagged,
        flag_note: member.flag_note,
        flagged_at: member.flagged_at,
      },
      readings,
      alerts,
    });
  } catch (err) {
    console.error("[doc-login/monitoring/patient]", err);
    return NextResponse.json({ error: "Failed to load patient." }, { status: 500 });
  }
}
