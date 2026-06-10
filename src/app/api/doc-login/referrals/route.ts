export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/doc-login/referrals — the logged-in doctor's sent referrals */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("doc_token")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const session = await prisma.doctorSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }

    const referrals = await prisma.referral.findMany({
      where: { doctor_email: session.doctor_email },
      orderBy: { created_at: "desc" },
      take: 200,
      include: {
        to_hospital: { select: { name: true, city: true, state: true } },
        events: { orderBy: { created_at: "asc" } },
      },
    });

    // Can this doctor refer at all? (must be registered by at least one hospital)
    const memberships = await prisma.hospitalDoctor.findMany({
      where: { doctor_email: session.doctor_email, hospital: { is_active: true } },
      include: { hospital: { select: { name: true } } },
    });

    return NextResponse.json({
      success: true,
      referrals,
      can_refer: memberships.length > 0,
      registered_hospitals: memberships.map((m) => m.hospital.name),
    });
  } catch (err) {
    console.error("[doc-login/referrals]", err);
    return NextResponse.json({ error: "Failed to load referrals." }, { status: 500 });
  }
}
