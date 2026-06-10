import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

    const normalised = email.trim().toLowerCase();
    const hospital = await prisma.hospital.findUnique({
      where: { email: normalised },
      select: { pin_hash: true, is_active: true, name: true },
    });

    if (!hospital || !hospital.is_active) {
      return NextResponse.json({
        exists: false,
        hasPin: false,
        error: "No hospital account found for this email. Contact Poveon to get registered.",
      });
    }

    return NextResponse.json({ exists: true, hasPin: !!hospital.pin_hash, name: hospital.name });
  } catch (err) {
    console.error("[hospital-login/check-pin]", err);
    return NextResponse.json({ error: "Failed to check." }, { status: 500 });
  }
}
