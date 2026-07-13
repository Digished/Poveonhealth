import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { RIDER_COOKIE } from "@/lib/rider-auth";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
    }
    const normalised = String(email).trim().toLowerCase();
    const trimmedCode = String(code).trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      return NextResponse.json({ error: "Code must be a 6-digit number." }, { status: 400 });
    }

    const codeHash = createHash("sha256").update(trimmedCode).digest("hex");
    const otp = await prisma.riderOtp.findFirst({
      where: { email: normalised, code_hash: codeHash, used: false, expires_at: { gt: new Date() } },
      orderBy: { created_at: "desc" },
    });
    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code. Please request a new one." }, { status: 401 });
    }

    const rider = await prisma.rider.findUnique({ where: { email: normalised } });
    if (!rider || !rider.is_active) {
      return NextResponse.json({ error: "No active rider account found." }, { status: 404 });
    }

    await prisma.riderOtp.update({ where: { id: otp.id }, data: { used: true } });

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await prisma.riderSession.create({
      data: { rider_id: rider.id, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set(RIDER_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[rider-login/verify-otp]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
