export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";

/** GET — full clinical record for one patient */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.hospitalPatient.findFirst({
      where: { id: params.id, hospital_id: hospital.id },
    });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });

    const [encounters, vitals, notes, prescriptions, labOrders, admissions] = await Promise.all([
      prisma.hospitalEncounter.findMany({ where: { patient_id: patient.id }, orderBy: { created_at: "desc" } }),
      prisma.vitalsRecord.findMany({ where: { patient_id: patient.id }, orderBy: { recorded_at: "desc" } }),
      prisma.consultationNote.findMany({ where: { patient_id: patient.id }, orderBy: { updated_at: "desc" } }),
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
