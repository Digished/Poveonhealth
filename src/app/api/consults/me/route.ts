export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getMemberByEmail, getPatientEmailFromRequest } from "@/lib/consult";
import { itemState } from "@/lib/treatment-plan";
import { medLiveWhere } from "@/lib/medication-status";
import { dedupeByDrug } from "@/lib/med-match";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/consults/me — the signed-in patient's care plan.
 *
 * Always answers for a signed-in patient, enrolled or not: `member` is null
 * when they have never joined, and `prefill` carries whatever we already know
 * about them (portal profile, then their most recent lab request) so the
 * enrolment form opens mostly filled in.
 */
export async function GET(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getPatientEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const [member, settings, profile] = await Promise.all([
      getMemberByEmail(email),
      getConsultSettings(),
      prisma.patientProfile.findUnique({
        where: { email },
        select: { name: true, phone: true, dob: true, sex: true, address: true },
      }),
    ]);

    const benefits = {
      price_naira: settings.price_naira,
      message_allowance: settings.message_allowance,
      lab_discount_percent: settings.lab_discount_percent,
      pharmacy_discount_percent: settings.pharmacy_discount_percent,
      topup_price_naira: settings.topup_price_naira,
      topup_messages: settings.topup_messages,
    };

    if (!member) {
      // Fall back to the last lab request for anyone we only know through a
      // referral — they've never filled in a portal profile.
      const lastRequest = profile?.name
        ? null
        : await prisma.request.findFirst({
            where: { patient_email: email },
            orderBy: { created_at: "desc" },
            select: { patient_name: true, patient_phone: true, dob: true, sex: true, address: true },
          });

      return NextResponse.json({
        success: true,
        member: null,
        benefits,
        prefill: {
          full_name: profile?.name ?? lastRequest?.patient_name ?? "",
          phone: profile?.phone ?? lastRequest?.patient_phone ?? "",
          date_of_birth: profile?.dob ?? (lastRequest?.dob ? lastRequest.dob.toISOString().slice(0, 10) : ""),
          sex: profile?.sex ?? lastRequest?.sex ?? "",
        },
      });
    }

    const [doctor, messages, redemptions, prescriptions, testOrders, preferredPharmacy, preferredLab, plan] =
      await Promise.all([
      member.doctor_email
        ? prisma.doctorProfile.findUnique({
            where: { email: member.doctor_email },
            select: { full_name: true, prefix: true, specialty: true, avatar_url: true },
          })
        : Promise.resolve(null),
      prisma.consultMessage.findMany({
        where: { patient_id: member.id },
        orderBy: { created_at: "asc" },
        take: 200,
      }),
      prisma.consultRedemption.findMany({
        where: { patient_id: member.id },
        orderBy: { created_at: "desc" },
        take: 20,
        include: { pharmacy: { select: { name: true } } },
      }),
      prisma.consultPrescription.findMany({
        // Never a suggestion: a draft the doctor has not confirmed is not
        // something the member should be reading as their medication.
        where: { patient_id: member.id, ...medLiveWhere },
        orderBy: [{ status: "asc" }, { created_at: "desc" }],
        take: 60,
      }),
      prisma.consultTestOrder.findMany({
        where: { patient_id: member.id },
        orderBy: [{ status: "asc" }, { due_date: "asc" }],
        take: 60,
      }),
      member.preferred_pharmacy_id
        ? prisma.pharmacy.findUnique({
            where: { id: member.preferred_pharmacy_id },
            select: { id: true, name: true, logo_url: true, phone: true, address: true, city: true, state: true, discount_percent: true },
          })
        : Promise.resolve(null),
      member.preferred_lab_id
        ? prisma.lab.findUnique({
            where: { id: member.preferred_lab_id },
            select: { id: true, name: true, logo_url: true, address: true, city: true, state: true },
          })
        : Promise.resolve(null),
      prisma.consultTreatmentPlan.findFirst({
        // A drafted plan is a suggestion to the doctor, not an instruction to
        // the member — it appears here only once they have confirmed it.
        where: { patient_id: member.id, status: "active", source: { not: "suggested" } },
        orderBy: { created_at: "desc" },
        include: { items: { orderBy: { position: "asc" } } },
      }),
    ]);

    // Mark the doctor's replies as read now that the member is looking at them.
    void prisma.consultMessage
      .updateMany({
        where: { patient_id: member.id, sender: "doctor", read_at: null },
        data: { read_at: new Date() },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      benefits,
      member: {
        id: member.id,
        code: member.code,
        full_name: member.full_name,
        email: member.email,
        phone: member.phone,
        sex: member.sex,
        date_of_birth: member.date_of_birth,
        state: member.state,
        city: member.city,
        conditions: member.conditions,
        status: member.status,
        subscribed_at: member.subscribed_at,
        expires_at: member.expires_at,
        messages_used: member.messages_used,
        message_allowance: member.message_allowance,
        messages_left: Math.max(0, member.message_allowance - member.messages_used),
        share_history: member.share_history,
      },
      doctor: doctor
        ? {
            name: `${doctor.prefix ? `${doctor.prefix} ` : ""}${doctor.full_name ?? ""}`.trim(),
            specialty: doctor.specialty,
            avatar_url: doctor.avatar_url,
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
            updated_at: plan.updated_at,
            items: plan.items.map((i) => ({
              id: i.id,
              label: i.label,
              detail: i.detail,
              cadence: i.cadence,
              // Without these the client cannot know an item wants a reading,
              // so it silently ticked instead of asking.
              measure: i.measure,
              measure_label: i.measure_label,
              done_count: i.done_count,
              ...itemState(i),
            })),
          }
        : null,
      redemptions: redemptions.map((r) => ({
        id: r.id,
        kind: r.kind,
        description: r.description,
        pharmacy_name: r.pharmacy?.name ?? null,
        gross_naira: Number(r.gross_naira),
        discount_naira: Number(r.discount_naira),
        created_at: r.created_at,
      })),
      // One row per drug: the same medication listed twice is a duplicate,
      // never two medications.
      prescriptions: dedupeByDrug(prescriptions),
      test_orders: testOrders,
      preferred_pharmacy: preferredPharmacy,
      preferred_lab: preferredLab,
    });
  } catch (err) {
    console.error("[consults/me]", err);
    return NextResponse.json({ error: "Could not load your care plan." }, { status: 500 });
  }
}
