export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** GET /api/doc-login/consults/patients/[id] — one member and their thread. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({ where: { id: params.id } });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const [messages, earning, redemptions, prescriptions, testOrders] = await Promise.all([
      prisma.consultMessage.findMany({
        where: { patient_id: patient.id },
        orderBy: { created_at: "asc" },
        take: 200,
      }),
      // The entitlement for the current subscription year.
      prisma.consultEarning.findFirst({
        where: { patient_id: patient.id },
        orderBy: { created_at: "desc" },
        select: { total_naira: true, released_naira: true, status: true },
      }),
      prisma.consultRedemption.findMany({
        where: { patient_id: patient.id },
        orderBy: { created_at: "desc" },
        take: 10,
        include: { pharmacy: { select: { name: true } } },
      }),
      prisma.consultPrescription.findMany({
        where: { patient_id: patient.id },
        orderBy: [{ status: "asc" }, { created_at: "desc" }],
        take: 60,
      }),
      prisma.consultTestOrder.findMany({
        where: { patient_id: patient.id },
        orderBy: [{ status: "asc" }, { due_date: "asc" }],
        take: 60,
      }),
    ]);

    // Opening the member clears their unread flag for the doctor.
    void prisma.consultMessage
      .updateMany({
        where: { patient_id: patient.id, sender: "patient", read_at: null },
        data: { read_at: new Date() },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        code: patient.code,
        full_name: patient.full_name,
        email: patient.email,
        phone: patient.phone,
        sex: patient.sex,
        date_of_birth: patient.date_of_birth,
        state: patient.state,
        city: patient.city,
        conditions: patient.conditions,
        status: patient.status,
        assigned_at: patient.assigned_at,
        subscribed_at: patient.subscribed_at,
        expires_at: patient.expires_at,
        messages_used: patient.messages_used,
        message_allowance: patient.message_allowance,
        messages_left: Math.max(0, patient.message_allowance - patient.messages_used),
      },
      baseline: patient.baseline_captured_at
        ? {
            medications: patient.baseline_medications,
            adherence: patient.medication_adherence,
            hypertension_years: patient.hypertension_years,
            diabetes_years: patient.diabetes_years,
            bp_systolic: patient.baseline_bp_systolic,
            bp_diastolic: patient.baseline_bp_diastolic,
            bp_taken_on: patient.baseline_bp_taken_on,
            glucose_mg_dl:
              patient.baseline_glucose_mg_dl == null
                ? null
                : Number(patient.baseline_glucose_mg_dl),
            glucose_context: patient.baseline_glucose_context,
            glucose_taken_on: patient.baseline_glucose_taken_on,
            notes: patient.baseline_notes,
            captured_at: patient.baseline_captured_at,
          }
        : null,
      earning: earning
        ? {
            total: Number(earning.total_naira),
            released: Number(earning.released_naira),
            pending: Math.max(0, Number(earning.total_naira) - Number(earning.released_naira)),
            status: earning.status,
          }
        : null,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        created_at: m.created_at,
      })),
      redemptions: redemptions.map((r) => ({
        id: r.id,
        kind: r.kind,
        description: r.description,
        pharmacy_name: r.pharmacy?.name ?? null,
        discount_naira: Number(r.discount_naira),
        created_at: r.created_at,
      })),
      prescriptions,
      test_orders: testOrders,
    });
  } catch (err) {
    console.error("[doc-login/consults/patients/[id]]", err);
    return NextResponse.json({ error: "Could not load that member." }, { status: 500 });
  }
}
