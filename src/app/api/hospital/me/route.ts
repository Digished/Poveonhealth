export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";

/** GET /api/hospital/me — hospital profile + referral counts */
export async function GET(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const [pending, accepted, doctors] = await Promise.all([
      prisma.referral.count({ where: { to_hospital_id: hospital.id, status: "pending" } }),
      prisma.referral.count({ where: { to_hospital_id: hospital.id, status: "accepted" } }),
      prisma.hospitalDoctor.count({ where: { hospital_id: hospital.id } }),
    ]);

    return NextResponse.json({
      success: true,
      hospital: {
        id: hospital.id,
        name: hospital.name,
        email: hospital.email,
        phone: hospital.phone,
        city: hospital.city,
        state: hospital.state,
        address: hospital.address,
        specialties: hospital.specialties,
        has_pin: !!hospital.pin_hash,
      },
      counts: { pending_referrals: pending, accepted_referrals: accepted, doctors },
    });
  } catch (err) {
    console.error("[hospital/me]", err);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}
