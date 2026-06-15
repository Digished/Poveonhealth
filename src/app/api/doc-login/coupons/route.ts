export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromRequest, MAX_COUPON_PERCENT } from "@/lib/doctor-encounter";
import { ensureEncounterSchema } from "@/lib/startup/ensure-encounter-schema";

/** GET /api/doc-login/coupons — the doctor's discount codes. */
export async function GET(req: NextRequest) {
  const email = await getDoctorEmailFromRequest(req);
  if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  await ensureEncounterSchema().catch(() => {});
  const coupons = await prisma.encounterCoupon.findMany({
    where: { doctor_email: email },
    orderBy: { created_at: "desc" },
  });
  return NextResponse.json({ success: true, coupons });
}

const BodySchema = z.object({
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9]+$/, "Use letters and numbers only."),
  percent_off: z.coerce.number().int().min(1).max(MAX_COUPON_PERCENT),
});

/** POST /api/doc-login/coupons — create a discount code. */
export async function POST(req: NextRequest) {
  try {
    const email = await getDoctorEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid coupon." }, { status: 400 });
    }
    await ensureEncounterSchema().catch(() => {});

    const code = parsed.data.code.toUpperCase();
    const existing = await prisma.encounterCoupon.findUnique({
      where: { doctor_email_code: { doctor_email: email, code } },
    });
    if (existing) return NextResponse.json({ error: "You already have a coupon with that code." }, { status: 409 });

    const coupon = await prisma.encounterCoupon.create({
      data: { doctor_email: email, code, percent_off: parsed.data.percent_off },
    });
    return NextResponse.json({ success: true, coupon });
  } catch (err) {
    console.error("[doc-login/coupons POST]", err);
    return NextResponse.json({ error: "Failed to create coupon." }, { status: 500 });
  }
}
