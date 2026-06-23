export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

const PATIENT_ROLES = ["onboarding_clerk", "nurse", "records"] as const;

// Demographic fields a staff member may edit (never hospital_number / hospital_id).
const EDITABLE_FIELDS = [
  "full_name", "sex", "phone", "email", "address", "city", "state",
  "occupation", "marital_status", "blood_group", "genotype", "allergies",
  "known_conditions", "next_of_kin_name", "next_of_kin_relationship",
  "next_of_kin_phone", "next_of_kin_address", "insurance_provider", "insurance_number",
] as const;

/** GET /api/emr/patients/[id] — full record + journey for a patient */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, [...PATIENT_ROLES])) {
      return NextResponse.json({ error: "You do not have patient access." }, { status: 403 });
    }

    const patient = await prisma.hospitalPatient.findFirst({
      where: { id: params.id, hospital_id: staff.hospital_id },
    });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

    const [encounters, vitals, notes, prescriptions, labOrders, admissions] = await Promise.all([
      prisma.hospitalEncounter.findMany({ where: { patient_id: patient.id }, orderBy: { created_at: "desc" } }),
      prisma.vitalsRecord.findMany({ where: { patient_id: patient.id }, orderBy: { recorded_at: "desc" } }),
      prisma.consultationNote.findMany({
        where: { patient_id: patient.id },
        orderBy: { updated_at: "desc" },
        select: { id: true, encounter_id: true, status: true, signed_at: true, updated_at: true },
      }),
      prisma.prescription.findMany({
        where: { patient_id: patient.id },
        orderBy: { created_at: "desc" },
        include: { items: { orderBy: { sort_order: "asc" } } },
      }),
      prisma.labOrder.findMany({
        where: { patient_id: patient.id },
        orderBy: { created_at: "desc" },
        include: { tests: { orderBy: { sort_order: "asc" } } },
      }),
      prisma.admission.findMany({ where: { patient_id: patient.id }, orderBy: { admitted_at: "desc" } }),
    ]);

    return NextResponse.json({
      success: true,
      patient,
      encounters,
      vitals,
      notes,
      prescriptions,
      lab_orders: labOrders,
      admissions,
    });
  } catch (err) {
    console.error("[emr/patients/[id] GET]", err);
    return NextResponse.json({ error: "Failed to load patient record." }, { status: 500 });
  }
}

/** PATCH /api/emr/patients/[id] — edit patient demographics */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, [...PATIENT_ROLES])) {
      return NextResponse.json({ error: "You do not have patient access." }, { status: 403 });
    }

    const existing = await prisma.hospitalPatient.findFirst({
      where: { id: params.id, hospital_id: staff.hospital_id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

    const body = await req.json();
    const data: Record<string, unknown> = {};

    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        const val = typeof body[field] === "string" ? body[field].trim() : body[field];
        data[field] = val || null;
      }
    }
    if (data.full_name !== undefined && !data.full_name) {
      return NextResponse.json({ error: "Patient name cannot be empty." }, { status: 400 });
    }
    if (body.age !== undefined) {
      data.age = body.age === "" || body.age === null ? null : parseInt(body.age, 10);
    }

    const patient = await prisma.hospitalPatient.update({ where: { id: params.id }, data });
    return NextResponse.json({ success: true, patient });
  } catch (err) {
    console.error("[emr/patients/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update patient." }, { status: 500 });
  }
}
