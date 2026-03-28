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

    const marketer = await prisma.marketer.findUnique({
      where: { email: normalised },
      select: { id: true, pin_hash: true, suspended: true },
    });
    if (!marketer) {
      return NextResponse.json({ error: "Invalid or expired code. Please request a new one." }, { status: 401 });
    }

    const codeHash = createHash("sha256").update(trimmedCode).digest("hex");

    const otp = await prisma.marketerOtp.findFirst({
      where: {
        marketer_id: marketer.id,
        code_hash: codeHash,
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    });

    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code. Please request a new one." }, { status: 401 });
    }

    await prisma.marketerOtp.update({ where: { id: otp.id }, data: { used: true } });

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await prisma.marketerSession.create({
      data: { marketer_id: marketer.id, expires_at: expiresAt },
    });

    const should_create_pin = !marketer.pin_hash;
    const res = NextResponse.json({ success: true, should_create_pin });
    res.cookies.set("scale_token", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[scale/verify-otp]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
