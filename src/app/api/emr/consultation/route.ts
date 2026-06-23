export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

/**
 * GET /api/emr/consultation?encounter_id=... — load (or lazily create) the draft
 * consultation note for an encounter, plus patient + latest vitals context.
 */
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["doctor"])) {
      return NextResponse.json({ error: "You do not have consultation access." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const encounterId = searchParams.get("encounter_id");
    if (!encounterId) return NextResponse.json({ error: "encounter_id is required." }, { status: 400 });

    const encounter = await prisma.hospitalEncounter.findFirst({
      where: { id: encounterId, hospital_id: staff.hospital_id },
      include: { patient: true, vitals: { orderBy: { recorded_at: "desc" }, take: 1 } },
    });
    if (!encounter) return NextResponse.json({ error: "Encounter not found." }, { status: 404 });

    let note = await prisma.consultationNote.findFirst({
      where: { encounter_id: encounter.id, status: "draft" },
      orderBy: { created_at: "desc" },
    });
    if (!note) {
      note = await prisma.consultationNote.create({
        data: {
          encounter_id: encounter.id,
          patient_id: encounter.patient_id,
          doctor_id: staff.id,
          content: [],
        },
      });
    }

    // Mark the encounter as in-consult when a doctor opens it.
    if (encounter.status === "waiting_consult") {
      await prisma.hospitalEncounter.update({
        where: { id: encounter.id },
        data: { status: "in_consult", attending_doctor_id: staff.id },
      });
    }

    return NextResponse.json({
      success: true,
      note,
      encounter: { id: encounter.id, status: encounter.status, chief_complaint: encounter.chief_complaint },
      patient: encounter.patient,
      latest_vitals: encounter.vitals[0] ?? null,
    });
  } catch (err) {
    console.error("[emr/consultation GET]", err);
    return NextResponse.json({ error: "Failed to load consultation." }, { status: 500 });
  }
}

/** PUT /api/emr/consultation — autosave the note's block content */
export async function PUT(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["doctor"])) {
      return NextResponse.json({ error: "You do not have consultation access." }, { status: 403 });
    }

    const { note_id, content } = await req.json();
    if (!note_id || !Array.isArray(content)) {
      return NextResponse.json({ error: "note_id and content[] are required." }, { status: 400 });
    }

    // Ownership check via the encounter's hospital.
    const note = await prisma.consultationNote.findUnique({
      where: { id: note_id },
      include: { encounter: { select: { hospital_id: true } } },
    });
    if (!note || note.encounter.hospital_id !== staff.hospital_id) {
      return NextResponse.json({ error: "Note not found." }, { status: 404 });
    }
    if (note.status === "signed") {
      return NextResponse.json({ error: "This note has been signed and is read-only." }, { status: 409 });
    }

    await prisma.consultationNote.update({
      where: { id: note_id },
      data: { content, doctor_id: staff.id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[emr/consultation PUT]", err);
    return NextResponse.json({ error: "Failed to save consultation." }, { status: 500 });
  }
}
