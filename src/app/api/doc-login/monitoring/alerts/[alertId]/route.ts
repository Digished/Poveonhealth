export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorFromRequest, doctorCoversMember } from "@/lib/hmo/auth";

// Acknowledge an alert.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { alertId: string } }
) {
  try {
    const doctor = await getDoctorFromRequest(req);
    if (!doctor) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const alert = await prisma.hmoVitalsAlert.findUnique({
      where: { id: params.alertId },
      include: { member: { select: { id: true, hmo_id: true } } },
    });
    if (!alert) {
      return NextResponse.json({ error: "Alert not found." }, { status: 404 });
    }
    if (!(await doctorCoversMember(doctor.doctor_email, alert.member))) {
      return NextResponse.json({ error: "You are not assigned to this patient." }, { status: 403 });
    }

    const updated = await prisma.hmoVitalsAlert.update({
      where: { id: alert.id },
      data: {
        status: "acknowledged",
        acknowledged_by: doctor.doctor_email,
        acknowledged_at: new Date(),
      },
    });

    return NextResponse.json({ success: true, alert: updated });
  } catch (err) {
    console.error("[doc-login/monitoring/alert ack]", err);
    return NextResponse.json({ error: "Failed to acknowledge alert." }, { status: 500 });
  }
}
