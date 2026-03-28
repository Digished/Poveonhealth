import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(req: NextRequest) {
  try {
    const { email, pin } = await req.json();
    if (!email || !pin) return NextResponse.json({ error: "Email and PIN required." }, { status: 400 });

    const normalised = email.trim().toLowerCase();
    const trimmedPin = String(pin).trim();
    if (!/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be 4 digits." }, { status: 400 });
    }

    const marketer = await prisma.marketer.findUnique({ where: { email: normalised } });
    if (!marketer || marketer.suspended) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }
    if (!marketer.pin_hash) {
      return NextResponse.json({ error: "No PIN set. Please use email code to log in." }, { status: 400 });
    }

    const pinHash = createHash("sha256").update(trimmedPin).digest("hex");
    if (pinHash !== marketer.pin_hash) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await prisma.marketerSession.create({
      data: { marketer_id: marketer.id, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set("scale_token", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[scale/verify-pin]", err);
    return NextResponse.json({ error: "Verification failed." }, { status: 500 });
  }
}
