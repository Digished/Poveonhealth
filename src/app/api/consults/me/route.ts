export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getMemberFromRequest } from "@/lib/consult";

/** GET /api/consults/me — the signed-in member's card, doctor and thread. */
export async function GET(req: NextRequest) {
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const settings = await getConsultSettings();

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
      member: {
        id: member.id,
        code: member.code,
        full_name: member.full_name,
        email: member.email,
        phone: member.phone,
        conditions: member.conditions,
        goal: member.goal,
        goal_metric: member.goal_metric,
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
      benefits: {
        lab_discount_percent: settings.lab_discount_percent,
        pharmacy_discount_percent: settings.pharmacy_discount_percent,
      },
    });
  } catch (err) {
    console.error("[consults/me]", err);
    return NextResponse.json({ error: "Could not load your care plan." }, { status: 500 });
  }
}
