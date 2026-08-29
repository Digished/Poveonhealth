export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getMemberByEmail, getPatientEmailFromRequest } from "@/lib/consult";

/**
 * GET /api/consults/me — the signed-in patient's care plan.
 *
 * Always answers for a signed-in patient, enrolled or not: `member` is null
 * when they have never joined, and `prefill` carries whatever we already know
 * about them (portal profile, then their most recent lab request) so the
 * enrolment form opens mostly filled in.
 */
export async function GET(req: NextRequest) {
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

    const [doctor, messages, redemptions] = await Promise.all([
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
        created_at: m.created_at,
      })),
      redemptions: redemptions.map((r) => ({
        id: r.id,
        kind: r.kind,
        description: r.description,
        pharmacy_name: r.pharmacy?.name ?? null,
        gross_naira: Number(r.gross_naira),
        discount_naira: Number(r.discount_naira),
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error("[consults/me]", err);
    return NextResponse.json({ error: "Could not load your care plan." }, { status: 500 });
  }
}
