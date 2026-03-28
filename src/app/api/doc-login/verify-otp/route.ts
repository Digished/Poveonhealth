import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
    }

    const normalised = email.trim().toLowerCase();
    const trimmedCode = String(code).trim();

    if (!/^\d{6}$/.test(trimmedCode)) {
      return NextResponse.json({ error: "Code must be a 6-digit number." }, { status: 400 });
    }

    const codeHash = createHash("sha256").update(trimmedCode).digest("hex");

    // Find a matching, unexpired, unused OTP
    const otp = await prisma.doctorOtp.findFirst({
      where: {
        email: normalised,
        code_hash: codeHash,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    });

    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code. Please request a new one." }, { status: 401 });
    }

    // Mark OTP as used
    await prisma.doctorOtp.update({ where: { id: otp.id }, data: { used: true } });

    // Create session
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await prisma.doctorSession.create({
      data: { doctor_email: normalised, expires_at: expiresAt },
    });

    // Let the client know if they should be prompted to create a PIN / fill in details
    const profile = await prisma.doctorProfile.findUnique({
      where: { email: normalised },
      select: { pin_hash: true, full_name: true },
    });
    const should_create_pin = !profile?.pin_hash;
    const has_profile = !!(profile?.full_name);

    const res = NextResponse.json({ success: true, should_create_pin, has_profile });
    res.cookies.set("doc_token", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[doc-login/verify-otp]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
