export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyConsultPayment } from "@/lib/consult";
import { pushTo } from "@/lib/push";
import { appUrl } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * POST /api/consults/medications/verify — confirm a medication payment.
 *
 * Safe to call repeatedly: the pending→paid flip is a compare-and-set on the
 * order, so a Paystack callback delivered twice, or a member refreshing the
 * return page, cannot mark an order paid twice or notify the pharmacy twice.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const { reference } = await req.json();
    if (!reference || typeof reference !== "string") {
      return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
    }

    const payment = await verifyConsultPayment(reference);
    if (!payment.success) {
      return NextResponse.json({ error: "That payment has not gone through." }, { status: 402 });
    }

    const order = await prisma.medicationOrder.findUnique({
      where: { paystack_ref: reference },
      include: { items: true, pharmacy: { select: { id: true, name: true, email: true, address: true } } },
    });
    if (!order) {
      return NextResponse.json({ error: "We could not match that payment to an order." }, { status: 404 });
    }

    const { count } = await prisma.medicationOrder.updateMany({
      where: { id: order.id, status: "pending" },
      data: { status: "paid", paid_at: new Date() },
    });

    if (count > 0) {
      // Tell the pharmacy there is money waiting to be made up. Fire and
      // forget — a failed notification must not fail a payment that succeeded.
      void pushTo("pharmacy", order.pharmacy.email, {
        title: "A member has paid for medication",
        body: `${order.items.length} item${order.items.length === 1 ? "" : "s"} to make up`,
        url: `${appUrl()}/pharmacy-dashboard`,
        tag: `med-order-${order.id}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      already: count === 0,
      order: {
        id: order.id,
        for_month: order.for_month,
        total_naira: Number(order.total_naira),
        saving_naira: Number(order.saving_naira),
        pharmacy_name: order.pharmacy.name,
        pharmacy_address: order.pharmacy.address,
        items: order.items.map((i) => ({
          name: i.name,
          strength: i.strength,
          quantity: i.quantity,
          member_naira: Number(i.member_naira),
        })),
      },
    });
  } catch (err) {
    console.error("[consults/medications/verify]", err);
    return NextResponse.json({ error: "Could not confirm that payment." }, { status: 500 });
  }
}
