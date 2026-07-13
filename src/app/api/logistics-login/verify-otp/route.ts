import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { LOGISTICS_COOKIE } from "@/lib/logistics-auth";

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
    const otp = await prisma.logisticsOtp.findFirst({
      where: { email: normalised, code_hash: codeHash, used: false, expires_at: { gt: new Date() } },
      orderBy: { created_at: "desc" },
    });
    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code. Please request a new one." }, { status: 401 });
    }

    const partner = await prisma.logisticsPartner.findUnique({ where: { email: normalised } });
    if (!partner || !partner.is_active) {
      return NextResponse.json({ error: "No active logistics account found." }, { status: 404 });
    }

    await prisma.logisticsOtp.update({ where: { id: otp.id }, data: { used: true } });

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await prisma.logisticsSession.create({
      data: { partner_id: partner.id, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set(LOGISTICS_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[logistics-login/verify-otp]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
