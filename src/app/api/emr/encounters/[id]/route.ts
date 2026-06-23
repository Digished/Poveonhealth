export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest } from "@/lib/emr-auth";

const ALLOWED_STATUSES = [
  "waiting_vitals", "waiting_consult", "in_consult", "pharmacy", "lab", "ward", "closed",
];

/** GET /api/emr/encounters/[id] — full context for a consultation */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const encounter = await prisma.hospitalEncounter.findFirst({
      where: { id: params.id, hospital_id: staff.hospital_id },
      include: {
        patient: true,
        vitals: { orderBy: { recorded_at: "desc" }, take: 1 },
      },
    });
    if (!encounter) return NextResponse.json({ error: "Encounter not found." }, { status: 404 });

    const note = await prisma.consultationNote.findFirst({
      where: { encounter_id: encounter.id },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({
      success: true,
      encounter: {
        id: encounter.id,
        status: encounter.status,
        type: encounter.type,
        chief_complaint: encounter.chief_complaint,
        created_at: encounter.created_at,
      },
      patient: encounter.patient,
      latest_vitals: encounter.vitals[0] ?? null,
      note,
    });
  } catch (err) {
    console.error("[emr/encounters/[id] GET]", err);
    return NextResponse.json({ error: "Failed to load encounter." }, { status: 500 });
  }
}

/** PATCH /api/emr/encounters/[id] — advance encounter status */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { status } = await req.json();
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const encounter = await prisma.hospitalEncounter.findFirst({
      where: { id: params.id, hospital_id: staff.hospital_id },
      select: { id: true },
    });
    if (!encounter) return NextResponse.json({ error: "Encounter not found." }, { status: 404 });

    const updated = await prisma.hospitalEncounter.update({
      where: { id: params.id },
      data: {
        status,
        ...(status === "in_consult" ? { attending_doctor_id: staff.id } : {}),
        ...(status === "closed" ? { closed_at: new Date() } : {}),
      },
    });

    return NextResponse.json({ success: true, encounter: updated });
  } catch (err) {
    console.error("[emr/encounters/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update encounter." }, { status: 500 });
  }
}
