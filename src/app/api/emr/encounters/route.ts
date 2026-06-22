export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest } from "@/lib/emr-auth";

const DEPT_STATUSES: Record<string, string[]> = {
  vitals: ["waiting_vitals"],
  consultation: ["waiting_consult", "in_consult"],
};

/**
 * GET /api/emr/encounters?dept=vitals|consultation
 * Returns the queue of open encounters for a department, newest last (FIFO),
 * each with patient summary and (for consultation) the latest vitals.
 */
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const dept = searchParams.get("dept") ?? "vitals";
    const statuses = DEPT_STATUSES[dept] ?? ["waiting_vitals"];

    const encounters = await prisma.hospitalEncounter.findMany({
      where: { hospital_id: staff.hospital_id, status: { in: statuses } },
      orderBy: { created_at: "asc" },
      take: 100,
      include: {
        patient: {
          select: { id: true, full_name: true, hospital_number: true, age: true, sex: true, allergies: true },
        },
        vitals: { orderBy: { recorded_at: "desc" }, take: 1 },
      },
    });

    return NextResponse.json({
      success: true,
      encounters: encounters.map((e) => ({
        id: e.id,
        status: e.status,
        type: e.type,
        chief_complaint: e.chief_complaint,
        created_at: e.created_at,
        patient: e.patient,
        latest_vitals: e.vitals[0] ?? null,
      })),
    });
  } catch (err) {
    console.error("[emr/encounters GET]", err);
    return NextResponse.json({ error: "Failed to load queue." }, { status: 500 });
  }
}
