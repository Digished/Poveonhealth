import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

    const normalised = email.trim().toLowerCase();
    const profile = await prisma.doctorProfile.findUnique({
      where: { email: normalised },
      select: {
        pin_hash: true,
        claimed: true,
        prefix: true,
        full_name: true,
        specialty: true,
        phone: true,
        hospitals: true,
        bank_name: true,
        account_number: true,
        account_name: true,
      },
    });

    // Unclaimed profile — pre-created by marketer, doctor has not verified yet
    if (profile && !profile.claimed) {
      return NextResponse.json({
        hasPin: false,
        unclaimed: true,
        profile: {
          prefix:         profile.prefix,
          full_name:      profile.full_name,
          specialty:      profile.specialty,
          phone:          profile.phone,
          hospitals:      profile.hospitals,
          bank_name:      profile.bank_name,
          account_number: profile.account_number,
          account_name:   profile.account_name,
        },
      });
    }

    return NextResponse.json({ hasPin: !!(profile?.pin_hash), unclaimed: false });
  } catch (err) {
    console.error("[doc-login/check-pin]", err);
    return NextResponse.json({ error: "Failed to check." }, { status: 500 });
  }
}
