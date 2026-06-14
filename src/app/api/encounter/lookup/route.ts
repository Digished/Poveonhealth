export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({ email: z.string().email() });

/** Derive an age (years) from an ISO date-of-birth string. */
function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const age = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  return age >= 0 && age <= 120 ? age : null;
}

/**
 * POST /api/encounter/lookup — given a patient email, return saved details for
 * auto-fill (name, phone, age, sex). Public; only returns the patient's own data.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ exists: false });

    const email = parsed.data.email.trim().toLowerCase();
    const profile = await prisma.patientProfile.findUnique({ where: { email } });
    if (!profile) return NextResponse.json({ exists: false });

    return NextResponse.json({
      exists: true,
      patient: {
        name: profile.name ?? "",
        phone: profile.phone ?? "",
        age: ageFromDob(profile.dob),
        sex: profile.sex ?? "",
      },
    });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
