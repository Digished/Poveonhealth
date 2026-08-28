export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { CONSULT_COOKIE, CONSULT_SESSION_MS } from "@/lib/consult";

/** POST /api/consults/verify-otp — exchange an emailed code for a session. */
export async function POST(req: NextRequest) {
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

    const member = await prisma.consultPatient.findUnique({ where: { email: normalised } });
    if (!member) {
      return NextResponse.json({ error: "Invalid or expired code." }, { status: 401 });
    }

    const otp = await prisma.patientOtp.findFirst({
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

    await prisma.patientOtp.update({ where: { id: otp.id }, data: { used: true } });

    const expiresAt = new Date(Date.now() + CONSULT_SESSION_MS);
    const session = await prisma.consultPatientSession.create({
      data: { patient_id: member.id, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true, status: member.status });
    res.cookies.set(CONSULT_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[consults/verify-otp]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
