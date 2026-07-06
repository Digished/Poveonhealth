import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHmoMemberFromRequest } from "@/lib/hmo/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await getHmoMemberFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const { member } = auth;

    const [latestBp, latestSugar] = await Promise.all([
      prisma.hmoVitalsReading.findFirst({
        where: { member_id: member.id, type: "bp" },
        orderBy: { recorded_at: "desc" },
      }),
      prisma.hmoVitalsReading.findFirst({
        where: { member_id: member.id, type: "sugar" },
        orderBy: { recorded_at: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      member: {
        id: member.id,
        email: member.email,
        full_name: member.full_name,
        policy_number: member.policy_number,
        phone: member.phone,
        date_of_birth: member.date_of_birth,
        sex: member.sex,
        hmo_name: member.hmo.name,
      },
      latest: { bp: latestBp, sugar: latestSugar },
    });
  } catch (err) {
    console.error("[hmo/me]", err);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}
