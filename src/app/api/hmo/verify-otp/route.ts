import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { HMO_COOKIE, HMO_SESSION_DURATION_MS } from "@/lib/hmo/auth";
import { consolidateMemberAccount } from "@/lib/hmo/consolidate";

export async function POST(req: NextRequest) {
  try {
    const { email, policy_number, code } = await req.json();

    if (!email || !policy_number || !code) {
      return NextResponse.json(
        { error: "Email, policy number and code are required." },
        { status: 400 }
      );
    }

    const normalisedEmail = String(email).trim().toLowerCase();
    const policyNumber = String(policy_number).trim();
    const trimmedCode = String(code).trim();

    if (!/^\d{6}$/.test(trimmedCode)) {
      return NextResponse.json({ error: "Code must be a 6-digit number." }, { status: 400 });
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
    if (!member) {
      return NextResponse.json(
        { error: "Invalid or expired code. Please request a new one." },
        { status: 401 }
      );
    }

    const codeHash = createHash("sha256").update(trimmedCode).digest("hex");
    const otp = await prisma.patientOtp.findFirst({
      where: {
        email: normalisedEmail,
        code_hash: codeHash,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    });

    if (!otp) {
      return NextResponse.json(
        { error: "Invalid or expired code. Please request a new one." },
        { status: 401 }
      );
    }

    await prisma.patientOtp.update({ where: { id: otp.id }, data: { used: true } });

    // The email is now verified — consolidate with the platform-wide patient
    // account (creating one if needed) so the member has a single identity
    // and a single PIN across the patient and HMO portals.
    await consolidateMemberAccount(member, { createProfile: true });

    const expiresAt = new Date(Date.now() + HMO_SESSION_DURATION_MS);
    const session = await prisma.hmoPatientSession.create({
      data: { member_id: member.id, expires_at: expiresAt },
    });

    // Prompt the member to create a PIN on first login (no PIN on the
    // consolidated account yet)
    const profile = await prisma.patientProfile.findUnique({
      where: { email: normalisedEmail },
      select: { pin_hash: true },
    });
    const should_create_pin = !profile?.pin_hash;

    const res = NextResponse.json({ success: true, should_create_pin });
    res.cookies.set(HMO_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[hmo/verify-otp]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
