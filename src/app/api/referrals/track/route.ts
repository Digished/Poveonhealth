export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/referrals/track?code=REF-XXXXXXX
 * Public tracking by referral code — returns status and a sanitized timeline.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code")?.trim().toUpperCase();
    if (!code) return NextResponse.json({ error: "Referral code required." }, { status: 400 });

    const referral = await prisma.referral.findUnique({
      where: { code },
      include: {
        to_hospital: { select: { name: true, city: true, state: true, address: true, phone: true } },
        events: { orderBy: { created_at: "asc" } },
      },
    });

    if (!referral) {
      return NextResponse.json({ error: "No referral found for this code." }, { status: 404 });
    }

    // Resolve hospital names for redirect events
    const hospitalIds = Array.from(
      new Set(
        referral.events.flatMap((e) => [e.from_hospital_id, e.to_hospital_id]).filter((v): v is string => !!v)
      )
    );
    const hospitals = hospitalIds.length
      ? await prisma.hospital.findMany({ where: { id: { in: hospitalIds } }, select: { id: true, name: true } })
      : [];
    const nameMap = new Map(hospitals.map((h) => [h.id, h.name]));

    return NextResponse.json({
      success: true,
      referral: {
        code: referral.code,
        status: referral.status,
        patient_name: referral.patient_name,
        doctor_name: referral.doctor_name,
        from_hospital: referral.from_hospital,
        specialty: referral.specialty,
        urgency: referral.urgency,
        response_note: referral.response_note,
        created_at: referral.created_at,
        responded_at: referral.responded_at,
        to_hospital: referral.to_hospital,
        events: referral.events.map((e) => ({
          type: e.type,
          actor_label: e.actor_label,
          from_hospital: e.from_hospital_id ? nameMap.get(e.from_hospital_id) ?? null : null,
          to_hospital: e.to_hospital_id ? nameMap.get(e.to_hospital_id) ?? null : null,
          note: e.note,
          created_at: e.created_at,
        })),
      },
    });
  } catch (err) {
    console.error("[referrals/track]", err);
    return NextResponse.json({ error: "Failed to look up referral." }, { status: 500 });
  }
}
