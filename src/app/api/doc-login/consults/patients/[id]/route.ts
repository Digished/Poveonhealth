export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { draftCarePlanFor, getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { itemState } from "@/lib/treatment-plan";
import { SCREENING_QUESTIONS } from "@/lib/screening";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** A screening round's stored answers, when the column holds what we wrote. */
function asAnswerMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Whole years since a date of birth, or null when we were never told. */
function ageFrom(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

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

    // A member who asked us not to share their history takes it with them: a
    // new doctor sees the conversation from the day they were assigned, not
    // everything the last one was told.
    const historyFrom =
      patient.share_history === false && patient.previous_doctors.length > 0
        ? patient.assigned_at
        : null;

    // eslint-disable-next-line prefer-const
    let [messages, earning, redemptions, prescriptions, testOrders, plan, planLogs, screenings] =
      await Promise.all([
      prisma.consultMessage.findMany({
        where: {
          patient_id: patient.id,
          ...(historyFrom ? { created_at: { gte: historyFrom } } : {}),
        },
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
        include: {
          // Whether the tablets were ever actually collected — the thing a
          // schedule on its own cannot tell you.
          fulfilments: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { status: true, created_at: true, recorded_by: true, note: true },
          },
        },
      }),
      prisma.consultTestOrder.findMany({
        where: { patient_id: patient.id },
        orderBy: [{ status: "asc" }, { due_date: "asc" }],
        take: 60,
        include: {
          fulfilments: {
            orderBy: { created_at: "desc" },
            take: 1,
            select: { status: true, created_at: true, recorded_by: true, note: true },
          },
        },
      }),
      prisma.consultTreatmentPlan.findFirst({
        where: { patient_id: patient.id, status: "active" },
        orderBy: { created_at: "desc" },
        include: { items: { orderBy: { position: "asc" } } },
      }),
      // The daily log: what the member actually recorded, which is the part
      // worth reading. A count of ticks says someone pressed a button.
      prisma.consultPlanLog.findMany({
        where: { patient_id: patient.id },
        orderBy: [{ logged_for: "desc" }, { created_at: "desc" }],
        take: 120,
        include: { item: { select: { label: true, measure: true, measure_label: true } } },
      }),
      // The symptom rounds, newest first. Twelve is a year of monthly answers,
      // which is as far back as a trend is worth reading on this page.
      prisma.consultScreening.findMany({
        where: { patient_id: patient.id },
        orderBy: { created_at: "desc" },
        take: 12,
      }),
    ]);

    // A member activated before a doctor was assigned has no draft yet. Done
    // here rather than up front so the common case — a plan already exists —
    // costs nothing: the query that would have checked is the one we just ran.
    if (!plan && patient.status === "active") {
      const drafted = await draftCarePlanFor(patient.id, email).catch(() => null);
      if (drafted?.plan) {
        [plan, prescriptions] = await Promise.all([
          prisma.consultTreatmentPlan.findFirst({
            where: { patient_id: patient.id, status: "active" },
            orderBy: { created_at: "desc" },
            include: { items: { orderBy: { position: "asc" } } },
          }),
          prisma.consultPrescription.findMany({
            where: { patient_id: patient.id },
            orderBy: [{ status: "asc" }, { created_at: "desc" }],
            take: 60,
            include: {
              fulfilments: {
                orderBy: { created_at: "desc" },
                take: 1,
                select: { status: true, created_at: true, recorded_by: true, note: true },
              },
            },
          }),
        ]);
      }
    }

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
        share_history: patient.share_history,
        previous_doctors: patient.previous_doctors,
        risk_level: patient.risk_level,
        risk_reason: patient.risk_reason,
        risk_rated_at: patient.risk_rated_at,
        risk_manual: patient.risk_manual,
        risk_note: patient.risk_note,
        // Only the age matters clinically, and it is what the doctor asks for.
        age: ageFrom(patient.date_of_birth),
      },
      history_withheld: !!historyFrom,
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
        has_image: !!m.image_url,
        created_at: m.created_at,
      })),
      plan: plan
        ? {
            id: plan.id,
            title: plan.title,
            note: plan.note,
            // A drafted plan is a suggestion until the doctor confirms it.
            source: plan.source,
            reviewed_at: plan.reviewed_at,
            notified_at: plan.notified_at,
            updated_at: plan.updated_at,
            items: plan.items.map((i) => ({
              id: i.id,
              label: i.label,
              detail: i.detail,
              cadence: i.cadence,
              remind: i.remind,
              measure: i.measure,
              measure_label: i.measure_label,
              done_count: i.done_count,
              ...itemState(i),
            })),
          }
        : null,
      plan_logs: planLogs.map((l) => ({
        id: l.id,
        item_id: l.item_id,
        item_label: l.item.label,
        measure: l.item.measure,
        measure_label: l.item.measure_label,
        note: l.note,
        systolic: l.systolic,
        diastolic: l.diastolic,
        glucose_mg_dl: l.glucose_mg_dl == null ? null : Number(l.glucose_mg_dl),
        weight_kg: l.weight_kg == null ? null : Number(l.weight_kg),
        value_number: l.value_number == null ? null : Number(l.value_number),
        value_text: l.value_text,
        logged_for: l.logged_for,
        created_at: l.created_at,
      })),
      // Answers resolved to the question they answered, so the doctor reads
      // "Chest tightness — only when I climb stairs", not "chest_tightness: on_exertion".
      screenings: screenings.map((r) => ({
        id: r.id,
        source: r.source,
        severity: r.severity,
        due_on: r.due_on,
        seen_at: r.seen_at,
        created_at: r.created_at,
        // `answers` is a Json column, so it is a JsonValue on the build machine
        // and could be anything at runtime. Read it only when it really is an
        // object, rather than casting and hoping.
        answers: Object.entries(asAnswerMap(r.answers))
          .map(([key, value]) => {
            const q = SCREENING_QUESTIONS.find((x) => x.key === key);
            const option = q?.options.find((o) => o.value === value);
            if (!q || !option) return null;
            return {
              key,
              prompt: q.prompt,
              tracks: q.tracks,
              group: q.group,
              answer: option.label,
              severity: option.severity,
            };
          })
          .filter((a): a is NonNullable<typeof a> => !!a),
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
