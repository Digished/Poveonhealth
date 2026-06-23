export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";
import { ensureDepartments } from "@/lib/emr/server";
import type { DepartmentKey } from "@/lib/emr/constants";

/** GET /api/hospital/emr/departments — list departments + live queue counts */
export async function GET(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    await ensureDepartments(hospital.id);

    const departments = await prisma.hospitalDepartment.findMany({
      where: { hospital_id: hospital.id },
      orderBy: { sort_order: "asc" },
    });

    // Live queue counts per department.
    const [encounters, pendingRx, openLabs, activeAdmissions] = await Promise.all([
      prisma.hospitalEncounter.groupBy({
        by: ["status"],
        where: { hospital_id: hospital.id, status: { not: "closed" } },
        _count: true,
      }),
      prisma.prescription.count({
        where: { patient: { hospital_id: hospital.id }, status: { in: ["pending", "partially_dispensed"] } },
      }),
      prisma.labOrder.count({
        where: { patient: { hospital_id: hospital.id }, status: { in: ["ordered", "collected"] } },
      }),
      prisma.admission.count({ where: { hospital_id: hospital.id, status: "admitted" } }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of encounters) byStatus[row.status] = row._count;

    const counts: Record<DepartmentKey, number> = {
      onboarding: 0,
      vitals: byStatus["waiting_vitals"] ?? 0,
      consultation: (byStatus["waiting_consult"] ?? 0) + (byStatus["in_consult"] ?? 0),
      pharmacy: pendingRx,
      laboratory: openLabs,
      ward: activeAdmissions,
    };

    return NextResponse.json({
      success: true,
      departments: departments.map((d) => ({
        id: d.id,
        key: d.key,
        name: d.name,
        is_active: d.is_active,
        sort_order: d.sort_order,
        queue: counts[d.key as DepartmentKey] ?? 0,
      })),
    });
  } catch (err) {
    console.error("[emr/departments GET]", err);
    return NextResponse.json({ error: "Failed to load departments." }, { status: 500 });
  }
}

/** PATCH /api/hospital/emr/departments — rename or toggle a department */
export async function PATCH(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { id, name, is_active } = await req.json();
    if (!id) return NextResponse.json({ error: "Department id required." }, { status: 400 });

    const dept = await prisma.hospitalDepartment.findFirst({ where: { id, hospital_id: hospital.id } });
    if (!dept) return NextResponse.json({ error: "Department not found." }, { status: 404 });

    const updated = await prisma.hospitalDepartment.update({
      where: { id },
      data: {
        ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
        ...(typeof is_active === "boolean" ? { is_active } : {}),
      },
    });

    return NextResponse.json({ success: true, department: updated });
  } catch (err) {
    console.error("[emr/departments PATCH]", err);
    return NextResponse.json({ error: "Failed to update department." }, { status: 500 });
  }
}
