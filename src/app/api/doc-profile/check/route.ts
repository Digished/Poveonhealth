export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/doc-profile/check?email=xxx
 * Public endpoint — checks if a DoctorProfile exists for the given email
 * and returns safe displayable info (no bank/pin details).
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ exists: false });
  }

  const profile = await prisma.doctorProfile.findUnique({
    where: { email },
    select: {
      email: true,
      prefix: true,
      full_name: true,
      hospitals: true,
      bank_name: true,
      account_number: true,
      claimed: true,
      // pin_hash intentionally excluded
    },
  });

  if (!profile) {
    return NextResponse.json({ exists: false });
  }

  const hasName = !!(profile.full_name?.trim());
  const hasHospital = profile.hospitals.length > 0;
  const hasBank = !!(profile.bank_name?.trim() && profile.account_number?.trim());

  return NextResponse.json({
    exists: true,
    profile_complete: hasName,
    claimed: profile.claimed,
    prefix: profile.prefix ?? null,
    full_name: hasName ? profile.full_name : null,
    hospital: hasHospital ? profile.hospitals[0] : null,
    hospitals: profile.hospitals,
    has_bank: hasBank,
  });
}
