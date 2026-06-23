export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest } from "@/lib/emr-auth";
import { ROLE_HOME, ROLE_LABELS } from "@/lib/emr/constants";

/** GET /api/emr/me — current staff member, their home department, and queue size */
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const hospital = await prisma.hospital.findUnique({
      where: { id: staff.hospital_id },
      select: { name: true },
    });

    // Lightweight per-department queue counts so the home screen can show badges.
    const [waitingVitals, waitingConsult, pendingRx, openLabs, admitted] = await Promise.all([
      prisma.hospitalEncounter.count({ where: { hospital_id: staff.hospital_id, status: "waiting_vitals" } }),
      prisma.hospitalEncounter.count({ where: { hospital_id: staff.hospital_id, status: { in: ["waiting_consult", "in_consult"] } } }),
      prisma.prescription.count({ where: { patient: { hospital_id: staff.hospital_id }, status: { in: ["pending", "partially_dispensed"] } } }),
      prisma.labOrder.count({ where: { patient: { hospital_id: staff.hospital_id }, status: { in: ["ordered", "collected"] } } }),
      prisma.admission.count({ where: { hospital_id: staff.hospital_id, status: "admitted" } }),
    ]);

    return NextResponse.json({
      success: true,
      staff: {
        id: staff.id,
        full_name: staff.full_name,
        role: staff.role,
        role_label: ROLE_LABELS[staff.role] ?? staff.role,
        home: ROLE_HOME[staff.role] ?? "all",
        department_key: staff.department_key,
      },
      hospital_name: hospital?.name ?? "Hospital",
      queues: {
        vitals: waitingVitals,
        consultation: waitingConsult,
        pharmacy: pendingRx,
        laboratory: openLabs,
        ward: admitted,
      },
    });
  } catch (err) {
    console.error("[emr/me]", err);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}
