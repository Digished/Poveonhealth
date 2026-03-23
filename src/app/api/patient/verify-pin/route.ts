import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { email, pin } = await req.json();
    if (!email || !pin) return NextResponse.json({ error: "Email and PIN required." }, { status: 400 });

    const normalised = email.trim().toLowerCase();
    const trimmedPin = String(pin).trim();

    if (!/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const pinHash = createHash("sha256").update(trimmedPin).digest("hex");

    const profile = await prisma.patientProfile.findUnique({
      where: { email: normalised },
      select: { pin_hash: true },
    });

    if (!profile?.pin_hash || profile.pin_hash !== pinHash) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await prisma.patientSession.create({
      data: { patient_email: normalised, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set("patient_token", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[patient/verify-pin]", err);
    return NextResponse.json({ error: "Verification failed." }, { status: 500 });
  }
}
