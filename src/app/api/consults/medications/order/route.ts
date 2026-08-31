export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appUrl, getMemberFromRequest } from "@/lib/consult";
import { priceMedication } from "@/lib/med-pricing";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  /** Catalogue rows to buy, with how many of each. */
  items: z
    .array(z.object({ medication_id: z.string().min(1), quantity: z.coerce.number().int().min(1).max(12).default(1) }))
    .min(1, "Pick something to pay for")
    .max(30),
  /**
   * The month this is for. Today's month means "I am collecting now"; next
   * month means "hold it for me" — which is the whole point of paying ahead.
   */
  for_month: z.enum(["this", "next"]).default("this"),
});

/** First of this month, or of next, in UTC. */
function monthStart(which: "this" | "next"): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (which === "next" ? 1 : 0), 1));
}

/**
 * POST /api/consults/medications/order — pay for medication.
 *
 * Prices are read from the catalogue here and copied onto the order, never
 * referenced: a pharmacy that changes its price list tomorrow must not change
 * what someone paid today.
 *
 * The pharmacy's share is split to their Paystack subaccount at the moment of
 * the charge, so they are paid as the member pays rather than being owed
 * afterwards. A pharmacy with no subaccount can still be ordered from — the
 * money simply lands with Poveon and settles separately — because blocking a
 * member's refill over the pharmacy's paperwork would be the wrong trade.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    if (member.status !== "active") {
      return NextResponse.json({ error: "Your care plan is not active." }, { status: 409 });
    }
    if (!member.preferred_pharmacy_id) {
      return NextResponse.json(
        { error: "Choose a pharmacy first, so we know where to send this." },
        { status: 409 }
      );
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid order." }, { status: 400 });
    }
    const { items, for_month } = parsed.data;

    const pharmacy = await prisma.pharmacy.findUnique({ where: { id: member.preferred_pharmacy_id } });
    if (!pharmacy || !pharmacy.active) {
      return NextResponse.json({ error: "That pharmacy is not taking orders." }, { status: 409 });
    }

    // Only rows that belong to this pharmacy, so a medication id from another
    // shop cannot be priced against this one.
    const rows = await prisma.pharmacyMedication.findMany({
      where: {
        id: { in: items.map((i) => i.medication_id) },
        pharmacy_id: pharmacy.id,
        active: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const defaultMargin = Number(pharmacy.margin_percent ?? 5);

    const lines: {
      medication_id: string; name: string; strength: string | null; form: string | null;
      quantity: number; list_price: number; concession: number; margin_percent: number;
      member_naira: number; pharmacy_naira: number; poveon_naira: number;
    }[] = [];

    for (const item of items) {
      const row = byId.get(item.medication_id);
      if (!row) continue;
      if (!row.in_stock) {
        return NextResponse.json(
          { error: `${row.name} is out of stock at ${pharmacy.name} right now.` },
          { status: 409 }
        );
      }
      const marginPercent = Number(row.margin_percent ?? defaultMargin);
      const price = priceMedication({
        listNaira: Number(row.list_price),
        concessionNaira: Number(row.concession),
        marginPercent,
      });
      lines.push({
        medication_id: row.id,
        name: row.name,
        strength: row.strength,
        form: row.form,
        quantity: item.quantity,
        list_price: Number(row.list_price),
        concession: Number(row.concession),
        margin_percent: marginPercent,
        member_naira: price.memberNaira * item.quantity,
        pharmacy_naira: price.pharmacyNaira * item.quantity,
        poveon_naira: price.poveonNaira * item.quantity,
      });
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: "None of those are on that pharmacy's list." }, { status: 400 });
    }

    const total = lines.reduce((s, l) => s + l.member_naira, 0);
    const pharmacyShare = lines.reduce((s, l) => s + l.pharmacy_naira, 0);
    const poveonShare = lines.reduce((s, l) => s + l.poveon_naira, 0);
    const listTotal = lines.reduce((s, l) => s + l.list_price * l.quantity, 0);

    if (total <= 0) {
      return NextResponse.json({ error: "That comes to nothing to pay." }, { status: 400 });
    }

    const order = await prisma.medicationOrder.create({
      data: {
        patient_id: member.id,
        pharmacy_id: pharmacy.id,
        for_month: monthStart(for_month),
        total_naira: total,
        pharmacy_naira: pharmacyShare,
        poveon_naira: poveonShare,
        saving_naira: listTotal - total,
        items: { create: lines },
      },
    });

    const payment = await initMedicationPayment({
      orderId: order.id,
      email: member.email,
      amountNaira: total,
      // Paystack splits in whole percent, and the pharmacy's share of an order
      // is rarely a round one — see the note in the helper.
      subaccount: pharmacy.paystack_subaccount_code,
      pharmacyShare,
    });

    if (!payment) {
      await prisma.medicationOrder.delete({ where: { id: order.id } }).catch(() => {});
      return NextResponse.json({ error: "We could not start that payment." }, { status: 502 });
    }

    await prisma.medicationOrder.update({
      where: { id: order.id },
      data: { paystack_ref: payment.reference },
    });

    return NextResponse.json({
      success: true,
      order_id: order.id,
      authorization_url: payment.authorizationUrl,
      total_naira: total,
      saving_naira: listTotal - total,
    });
  } catch (err) {
    console.error("[consults/medications/order]", err);
    return NextResponse.json({ error: "Could not start that order." }, { status: 500 });
  }
}

/**
 * Start a Paystack charge for a medication order.
 *
 * When the pharmacy has a subaccount, the charge carries a split so their share
 * lands with them directly. Paystack takes the split as a flat amount in kobo
 * (`transaction_charge` is Poveon's cut), which is exactly what we want: the
 * shares are already worked out to the kobo by lib/med-pricing.ts, so nothing
 * is re-derived from a percentage that would round differently.
 */
async function initMedicationPayment(params: {
  orderId: string;
  email: string;
  amountNaira: number;
  subaccount: string | null;
  pharmacyShare: number;
}): Promise<{ authorizationUrl: string; reference: string } | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[medication order] PAYSTACK_SECRET_KEY not set");
    return null;
  }
  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amountNaira * 100),
        currency: "NGN",
        callback_url: `${appUrl()}/consults/medication-paid`,
        metadata: { purpose: "medication_order", order_id: params.orderId },
        ...(params.subaccount
          ? {
              subaccount: params.subaccount,
              // Poveon's cut, in kobo. Everything else goes to the pharmacy.
              transaction_charge: Math.round((params.amountNaira - params.pharmacyShare) * 100),
              bearer: "account",
            }
          : {}),
      }),
    });
    const data = await res.json();
    if (!data.status || !data.data?.authorization_url) {
      console.error("[medication order] paystack init failed:", JSON.stringify(data));
      return null;
    }
    return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
  } catch (e) {
    console.error("[medication order] paystack init error:", e);
    return null;
  }
}
