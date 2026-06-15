export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  slug: z.string().trim().min(1),
  code: z.string().trim().min(1).max(24),
});

/**
 * POST /api/encounter/coupon — validate a discount code for a doctor's page.
 * Returns the percent off when the code is active; otherwise valid:false.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ valid: false });

    const profile = await prisma.doctorProfile.findUnique({
      where: { encounter_slug: parsed.data.slug.toLowerCase() },
      select: { email: true },
    });
    if (!profile) return NextResponse.json({ valid: false });

    const coupon = await prisma.encounterCoupon.findUnique({
      where: { doctor_email_code: { doctor_email: profile.email, code: parsed.data.code.toUpperCase() } },
    }).catch(() => null);

    if (!coupon || !coupon.active) return NextResponse.json({ valid: false });
    return NextResponse.json({ valid: true, code: coupon.code, percent_off: coupon.percent_off });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
