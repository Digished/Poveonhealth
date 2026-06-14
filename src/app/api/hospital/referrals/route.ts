export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";

/** GET /api/hospital/referrals — incoming referrals for the logged-in hospital */
export async function GET(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const q = searchParams.get("q")?.trim();

    const referrals = await prisma.referral.findMany({
      where: {
        to_hospital_id: hospital.id,
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { patient_name: { contains: q, mode: "insensitive" } },
                { doctor_name: { contains: q, mode: "insensitive" } },
                { patient_phone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 200,
      include: { events: { orderBy: { created_at: "asc" } } },
    });

    return NextResponse.json({ success: true, referrals });
  } catch (err) {
    console.error("[hospital/referrals GET]", err);
    return NextResponse.json({ error: "Failed to load referrals." }, { status: 500 });
  }
}
