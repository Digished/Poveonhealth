import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { HMO_COOKIE, HMO_SESSION_DURATION_MS } from "@/lib/hmo/auth";
import { consolidateMemberAccount } from "@/lib/hmo/consolidate";

// Signs an HMO member in with the 4-digit PIN of their consolidated patient
// account (PatientProfile, keyed by verified email).
export async function POST(req: NextRequest) {
  try {
    const { email, policy_number, pin } = await req.json();

    if (!email || !policy_number || !pin) {
      return NextResponse.json(
        { error: "Email, policy number and PIN are required." },
        { status: 400 }
      );
    }

    const normalisedEmail = String(email).trim().toLowerCase();
    const policyNumber = String(policy_number).trim();
    const trimmedPin = String(pin).trim();

    if (!/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const member = await prisma.hmoMember.findFirst({
      where: {
        email: normalisedEmail,
        policy_number: { equals: policyNumber, mode: "insensitive" },
        active: true,
        hmo: { active: true },
      },
      orderBy: { created_at: "desc" },
    });

    const pinHash = createHash("sha256").update(trimmedPin).digest("hex");
    const profile = member
      ? await prisma.patientProfile.findUnique({
          where: { email: normalisedEmail },
          select: { pin_hash: true },
        })
      : null;

    if (!member || !profile?.pin_hash || profile.pin_hash !== pinHash) {
      return NextResponse.json({ error: "Incorrect details or PIN." }, { status: 401 });
    }

    // Keep the roster entry in sync with the verified patient account
    await consolidateMemberAccount(member);

    const expiresAt = new Date(Date.now() + HMO_SESSION_DURATION_MS);
    const session = await prisma.hmoPatientSession.create({
      data: { member_id: member.id, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set(HMO_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[hmo/verify-pin]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
