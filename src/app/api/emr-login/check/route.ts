import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/emr-login/check
 * Body: { hospital_email, identifier }  (identifier = staff email or phone)
 * Returns whether the staff member exists and whether they have a PIN set.
 */
export async function POST(req: NextRequest) {
  try {
    const { hospital_email, identifier } = await req.json();
    if (!hospital_email || !identifier) {
      return NextResponse.json({ error: "Hospital email and your email/phone are required." }, { status: 400 });
    }

    const hospital = await prisma.hospital.findUnique({
      where: { email: String(hospital_email).trim().toLowerCase() },
    });
    if (!hospital || !hospital.is_active) {
      return NextResponse.json({ exists: false, error: "Hospital not found." }, { status: 404 });
    }

    const id = String(identifier).trim();
    const staff = await prisma.hospitalStaff.findFirst({
      where: {
        hospital_id: hospital.id,
        is_active: true,
        OR: [{ email: id.toLowerCase() }, { phone: id }],
      },
    });

    if (!staff) {
      return NextResponse.json({ exists: false, error: "No staff account found. Ask your admin to add you." }, { status: 404 });
    }

    return NextResponse.json({
      exists: true,
      has_pin: !!staff.pin_hash,
      staff_name: staff.full_name,
      hospital_name: hospital.name,
    });
  } catch (err) {
    console.error("[emr-login/check]", err);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
