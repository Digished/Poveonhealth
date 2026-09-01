export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { PHARMACY_COOKIE, PHARMACY_SESSION_MS } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** POST /api/pharmacy/verify-pin — sign in with the PIN, no emailed code. */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const { email, pin } = await req.json();
    if (!email || !pin) return NextResponse.json({ error: "Email and PIN required." }, { status: 400 });

    const trimmedPin = String(pin).trim();
    if (!/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      select: { id: true, active: true, pin_hash: true },
    });

    const pinHash = createHash("sha256").update(trimmedPin).digest("hex");
    if (!pharmacy?.active || !pharmacy.pin_hash || pharmacy.pin_hash !== pinHash) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    const expiresAt = new Date(Date.now() + PHARMACY_SESSION_MS);
    const session = await prisma.pharmacySession.create({
      data: { pharmacy_id: pharmacy.id, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set(PHARMACY_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[pharmacy/verify-pin]", err);
    return NextResponse.json({ error: "Sign-in failed. Please try again." }, { status: 500 });
  }
}
