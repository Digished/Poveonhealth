export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * POST /api/emr/vitals — record a vitals set for an encounter and move it to the
 * consultation queue.
 */
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["nurse", "ward_nurse"])) {
      return NextResponse.json({ error: "You do not have vitals access." }, { status: 403 });
    }

    const body = await req.json();
    const encounter = await prisma.hospitalEncounter.findFirst({
      where: { id: body.encounter_id, hospital_id: staff.hospital_id },
      select: { id: true, patient_id: true, status: true },
    });
    if (!encounter) return NextResponse.json({ error: "Encounter not found." }, { status: 404 });

    const weight = num(body.weight_kg);
    const height = num(body.height_cm);
    const bmi = weight && height ? Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10 : null;

    const vitals = await prisma.vitalsRecord.create({
      data: {
        encounter_id: encounter.id,
        patient_id: encounter.patient_id,
        temperature: num(body.temperature),
        systolic: num(body.systolic),
        diastolic: num(body.diastolic),
        pulse: num(body.pulse),
        resp_rate: num(body.resp_rate),
        spo2: num(body.spo2),
        weight_kg: weight,
        height_cm: height,
        bmi,
        blood_sugar: num(body.blood_sugar),
        pain_score: num(body.pain_score),
        notes: body.notes || null,
        recorded_by: staff.id,
      },
    });

    // Advance to consultation queue (unless already past it).
    if (encounter.status === "waiting_vitals") {
      await prisma.hospitalEncounter.update({
        where: { id: encounter.id },
        data: { status: "waiting_consult" },
      });
    }

    return NextResponse.json({ success: true, vitals });
  } catch (err) {
    console.error("[emr/vitals POST]", err);
    return NextResponse.json({ error: "Failed to save vitals." }, { status: 500 });
  }
}
