export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorPatientCount, isEncounterReady, priceForPlan } from "@/lib/doctor-encounter";

/**
 * GET /api/encounter/[slug] — public doctor profile, pricing, and trust-badge
 * patient count for the shared encounter page. No auth.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug?.trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const profile = await prisma.doctorProfile.findUnique({ where: { encounter_slug: slug } });
  if (!profile) return NextResponse.json({ error: "Doctor not found." }, { status: 404 });

  const ready = isEncounterReady(profile);
  const patientCount = await getDoctorPatientCount(profile.email);

  return NextResponse.json({
    success: true,
    ready,
    doctor: {
      slug,
      prefix: profile.prefix ?? null,
      full_name: profile.full_name ?? null,
      specialty: profile.specialty ?? null,
      hospitals: profile.hospitals ?? [],
      patient_count: patientCount,
    },
    pricing: {
      single: priceForPlan(profile, "single"),
      monthly: priceForPlan(profile, "monthly"),
      yearly: priceForPlan(profile, "yearly"),
    },
  });
}
