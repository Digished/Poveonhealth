export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { PHARMACY_COOKIE, PHARMACY_SESSION_MS } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** POST /api/pharmacy/verify-otp — exchange an emailed code for a session. */
export async function POST(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
    }
    const normalised = String(email).trim().toLowerCase();
    const trimmed = String(code).trim();
    if (!/^\d{6}$/.test(trimmed)) {
      return NextResponse.json({ error: "Code must be a 6-digit number." }, { status: 400 });
    }

    const pharmacy = await prisma.pharmacy.findUnique({ where: { email: normalised } });
    if (!pharmacy || !pharmacy.active) {
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });
    }

    const otp = await prisma.pharmacyOtp.findFirst({
      where: {
        email: normalised,
        code_hash: createHash("sha256").update(trimmed).digest("hex"),
        used: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    });
    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code. Please request a new one." }, { status: 401 });
    }

    await prisma.pharmacyOtp.update({ where: { id: otp.id }, data: { used: true } });
    if (!pharmacy.onboarded_at) {
      await prisma.pharmacy.update({ where: { id: pharmacy.id }, data: { onboarded_at: new Date() } });
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
    console.error("[pharmacy/verify-otp]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
