export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";
import { generateHospitalNumber } from "@/lib/emr/server";

/**
 * POST /api/emr/onboarding
 * Registers a patient (or reuses an existing one by id) and opens an encounter
 * that immediately enters the vitals queue.
 */
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["onboarding_clerk", "nurse", "records"])) {
      return NextResponse.json({ error: "You do not have onboarding access." }, { status: 403 });
    }

    const body = await req.json();
    let patientId: string = body.patient_id ?? "";

    if (!patientId) {
      const full_name = String(body.full_name ?? "").trim();
      if (!full_name) return NextResponse.json({ error: "Patient name is required." }, { status: 400 });

      const hospital_number = await generateHospitalNumber(staff.hospital_id);
      const patient = await prisma.hospitalPatient.create({
        data: {
          hospital_id: staff.hospital_id,
          hospital_number,
          full_name,
          age: body.age != null && body.age !== "" ? parseInt(body.age, 10) : null,
          sex: body.sex || null,
          phone: body.phone || null,
          email: body.email || null,
          address: body.address || null,
          city: body.city || null,
          state: body.state || null,
          occupation: body.occupation || null,
          marital_status: body.marital_status || null,
          blood_group: body.blood_group || null,
          genotype: body.genotype || null,
          allergies: body.allergies || null,
          known_conditions: body.known_conditions || null,
          next_of_kin_name: body.next_of_kin_name || null,
          next_of_kin_relationship: body.next_of_kin_relationship || null,
          next_of_kin_phone: body.next_of_kin_phone || null,
          next_of_kin_address: body.next_of_kin_address || null,
          insurance_provider: body.insurance_provider || null,
          insurance_number: body.insurance_number || null,
          created_by: staff.id,
        },
      });
      patientId = patient.id;
    } else {
      const exists = await prisma.hospitalPatient.findFirst({
        where: { id: patientId, hospital_id: staff.hospital_id },
        select: { id: true },
      });
      if (!exists) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }

    const encounter = await prisma.hospitalEncounter.create({
      data: {
        hospital_id: staff.hospital_id,
        patient_id: patientId,
        type: body.type === "emergency" ? "emergency" : "outpatient",
        status: "waiting_vitals",
        chief_complaint: body.chief_complaint || null,
        created_by: staff.id,
      },
    });

    return NextResponse.json({ success: true, patient_id: patientId, encounter });
  } catch (err) {
    console.error("[emr/onboarding]", err);
    return NextResponse.json({ error: "Failed to onboard patient." }, { status: 500 });
  }
}
