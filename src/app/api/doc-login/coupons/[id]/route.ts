export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromRequest, MAX_COUPON_PERCENT } from "@/lib/doctor-encounter";

const PatchSchema = z.object({
  active: z.boolean().optional(),
  percent_off: z.coerce.number().int().min(1).max(MAX_COUPON_PERCENT).optional(),
});

/** PATCH /api/doc-login/coupons/[id] — toggle or update a coupon. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const email = await getDoctorEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const coupon = await prisma.encounterCoupon.findUnique({ where: { id: params.id } });
    if (!coupon || coupon.doctor_email !== email) {
      return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    }

    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (parsed.data.active !== undefined) data.active = parsed.data.active;
    if (parsed.data.percent_off !== undefined) data.percent_off = parsed.data.percent_off;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

    const updated = await prisma.encounterCoupon.update({ where: { id: params.id }, data });
    return NextResponse.json({ success: true, coupon: updated });
  } catch (err) {
    console.error("[doc-login/coupons PATCH]", err);
    return NextResponse.json({ error: "Failed to update coupon." }, { status: 500 });
  }
}

/** DELETE /api/doc-login/coupons/[id] — remove a coupon. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const email = await getDoctorEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const coupon = await prisma.encounterCoupon.findUnique({ where: { id: params.id } });
    if (!coupon || coupon.doctor_email !== email) {
      return NextResponse.json({ error: "Coupon not found." }, { status: 404 });
    }
    await prisma.encounterCoupon.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/coupons DELETE]", err);
    return NextResponse.json({ error: "Failed to delete coupon." }, { status: 500 });
  }
}
