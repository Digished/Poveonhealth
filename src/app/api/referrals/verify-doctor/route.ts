export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const VerifySchema = z.object({
  email: z.string().email(),
  pin: z.string().regex(/^\d{4}$/),
});

/**
 * POST /api/referrals/verify-doctor
 * Verifies a doctor's email + PIN and returns the hospitals that have
 * registered them — the doctor picks which one they are referring from.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = VerifySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid email and 4-digit PIN are required." }, { status: 400 });
    }
    const email = parsed.data.email.trim().toLowerCase();

    const profile = await prisma.doctorProfile.findUnique({
      where: { email },
      select: { pin_hash: true, prefix: true, full_name: true },
    });
    const pinHash = createHash("sha256").update(parsed.data.pin).digest("hex");
    if (!profile?.pin_hash || profile.pin_hash !== pinHash) {
      return NextResponse.json(
        { error: "Incorrect email or PIN. If you haven't set a PIN yet, log in to the doctor portal first." },
        { status: 401 }
      );
    }

    const memberships = await prisma.hospitalDoctor.findMany({
      where: { doctor_email: email, hospital: { is_active: true } },
      include: { hospital: { select: { id: true, name: true, city: true, state: true } } },
      orderBy: { created_at: "asc" },
    });

    if (memberships.length === 0) {
      return NextResponse.json(
        {
          error:
            "Your email is not yet registered by any hospital on the Poveon referral network. Ask your hospital to add you from their dashboard.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      doctor_name: profile.full_name
        ? `${profile.prefix ? `${profile.prefix} ` : "Dr. "}${profile.full_name}`
        : email,
      hospitals: memberships.map((m) => m.hospital),
    });
  } catch (err) {
    console.error("[referrals/verify-doctor]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
