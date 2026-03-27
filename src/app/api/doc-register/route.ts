import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function POST(req: NextRequest) {
  try {
    const { email, prefix, full_name, hospitals, pin } = await req.json();

    if (!email || !full_name || !pin) {
      return NextResponse.json({ error: "Email, full name, and PIN are required." }, { status: 400 });
    }

    const normalised = String(email).trim().toLowerCase();
    const trimmedPin = String(pin).trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    if (!/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    // Check if an account with a PIN already exists
    const existing = await prisma.doctorProfile.findUnique({
      where: { email: normalised },
      select: { pin_hash: true },
    });
    if (existing?.pin_hash) {
      return NextResponse.json({ error: "An account with this email already exists. Please log in instead." }, { status: 409 });
    }

    const pinHash = createHash("sha256").update(trimmedPin).digest("hex");

    await prisma.doctorProfile.upsert({
      where: { email: normalised },
      create: {
        email: normalised,
        prefix: prefix?.trim() || null,
        full_name: String(full_name).trim(),
        hospitals: Array.isArray(hospitals) ? hospitals.filter(Boolean) : [],
        pin_hash: pinHash,
      },
      update: {
        prefix: prefix?.trim() || null,
        full_name: String(full_name).trim(),
        hospitals: Array.isArray(hospitals) ? hospitals.filter(Boolean) : [],
        pin_hash: pinHash,
      },
    });

    // Create session
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    const session = await prisma.doctorSession.create({
      data: { doctor_email: normalised, expires_at: expiresAt },
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set("doc_token", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
    return res;
  } catch (err) {
    console.error("[doc-register]", err);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
