export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

/** GET /api/emr/admissions?status=admitted — ward list */
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["ward_nurse", "nurse", "doctor"])) {
      return NextResponse.json({ error: "You do not have ward access." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "admitted";

    const admissions = await prisma.admission.findMany({
      where: { hospital_id: staff.hospital_id, ...(status === "all" ? {} : { status }) },
      orderBy: { admitted_at: "desc" },
      take: 100,
      include: { patient: { select: { full_name: true, hospital_number: true, age: true, sex: true } } },
    });

    return NextResponse.json({ success: true, admissions });
  } catch (err) {
    console.error("[emr/admissions GET]", err);
    return NextResponse.json({ error: "Failed to load admissions." }, { status: 500 });
  }
}

/** POST /api/emr/admissions — admit a patient by hospital number / id */
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["ward_nurse", "nurse", "doctor"])) {
      return NextResponse.json({ error: "You do not have ward access." }, { status: 403 });
    }

    const body = await req.json();
    const ward_name = String(body.ward_name ?? "").trim();
    if (!ward_name) return NextResponse.json({ error: "Ward name is required." }, { status: 400 });

    // Resolve the patient by id or hospital number.
    const patient = await prisma.hospitalPatient.findFirst({
      where: {
        hospital_id: staff.hospital_id,
        OR: [{ id: body.patient_id ?? "" }, { hospital_number: body.hospital_number ?? "" }],
      },
    });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

    // Reuse the patient's most recent open encounter, or open a fresh admission one.
    let encounter = await prisma.hospitalEncounter.findFirst({
      where: { patient_id: patient.id, status: { not: "closed" } },
      orderBy: { created_at: "desc" },
    });
    if (!encounter) {
      encounter = await prisma.hospitalEncounter.create({
        data: {
          hospital_id: staff.hospital_id,
          patient_id: patient.id,
          type: "admission",
          status: "ward",
          created_by: staff.id,
        },
      });
    } else {
      await prisma.hospitalEncounter.update({ where: { id: encounter.id }, data: { status: "ward", type: "admission" } });
    }

    const admission = await prisma.admission.create({
      data: {
        hospital_id: staff.hospital_id,
        encounter_id: encounter.id,
        patient_id: patient.id,
        ward_name,
        bed_label: body.bed_label || null,
        admitting_doctor_id: staff.role === "doctor" ? staff.id : null,
        reason: body.reason || null,
        status: "admitted",
      },
    });

    return NextResponse.json({ success: true, admission });
  } catch (err) {
    console.error("[emr/admissions POST]", err);
    return NextResponse.json({ error: "Failed to admit patient." }, { status: 500 });
  }
}
