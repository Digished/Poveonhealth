export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

/** PATCH /api/emr/admissions/[id] — discharge or update bed */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["ward_nurse", "nurse", "doctor"])) {
      return NextResponse.json({ error: "You do not have ward access." }, { status: 403 });
    }

    const admission = await prisma.admission.findFirst({
      where: { id: params.id, hospital_id: staff.hospital_id },
      select: { id: true, encounter_id: true },
    });
    if (!admission) return NextResponse.json({ error: "Admission not found." }, { status: 404 });

    const body = await req.json();

    if (body.action === "discharge") {
      await prisma.admission.update({
        where: { id: params.id },
        data: { status: "discharged", discharged_at: new Date(), discharge_summary: body.discharge_summary || null },
      });
      await prisma.hospitalEncounter.update({
        where: { id: admission.encounter_id },
        data: { status: "closed", closed_at: new Date() },
      });
    } else if (typeof body.bed_label === "string") {
      await prisma.admission.update({ where: { id: params.id }, data: { bed_label: body.bed_label || null } });
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const updated = await prisma.admission.findUnique({ where: { id: params.id } });
    return NextResponse.json({ success: true, admission: updated });
  } catch (err) {
    console.error("[emr/admissions/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update admission." }, { status: 500 });
  }
}
