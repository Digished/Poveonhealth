import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPin, STAFF_SESSION_DURATION_MS } from "@/lib/emr-auth";

/**
 * POST /api/emr-login/verify-pin
 * Body: { hospital_email, identifier, pin }
 * On success sets the emr_token cookie.
 */
export async function POST(req: NextRequest) {
  try {
    const { hospital_email, identifier, pin } = await req.json();
    if (!hospital_email || !identifier || !pin) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }

    const trimmedPin = String(pin).trim();
    if (!/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const hospital = await prisma.hospital.findUnique({
      where: { email: String(hospital_email).trim().toLowerCase() },
    });
    if (!hospital || !hospital.is_active) {
      return NextResponse.json({ error: "Hospital not found." }, { status: 404 });
    }

    const id = String(identifier).trim();
    const staff = await prisma.hospitalStaff.findFirst({
      where: {
        hospital_id: hospital.id,
        is_active: true,
        OR: [{ email: id.toLowerCase() }, { phone: id }],
      },
    });

    if (!staff || !staff.pin_hash || staff.pin_hash !== hashPin(trimmedPin)) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    const expiresAt = new Date(Date.now() + STAFF_SESSION_DURATION_MS);
    const session = await prisma.hospitalStaffSession.create({
      data: { staff_id: staff.id, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true, staff_name: staff.full_name, role: staff.role });
    res.cookies.set("emr_token", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[emr-login/verify-pin]", err);
    return NextResponse.json({ error: "Verification failed." }, { status: 500 });
  }
}
