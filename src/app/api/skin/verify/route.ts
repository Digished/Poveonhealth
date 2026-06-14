export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifySkinConsult, verifySkinPayment } from "@/lib/skin-consult";

/**
 * GET /api/skin/verify?reference=... — confirm a Paystack payment, finalise the
 * consult, and reveal the code. Idempotent: the notify step runs only on the
 * transition from awaiting_payment → new.
 */
export async function GET(req: NextRequest) {
  try {
    const reference = new URL(req.url).searchParams.get("reference")?.trim();
    if (!reference) return NextResponse.json({ error: "Payment reference required." }, { status: 400 });

    const consult = await prisma.skinConsult.findUnique({ where: { payment_reference: reference } });
    if (!consult) return NextResponse.json({ error: "Consultation not found for this payment." }, { status: 404 });

    // Already finalised (e.g. page refresh) — just return the code
    if (consult.is_paid && consult.status !== "awaiting_payment") {
      return NextResponse.json({ success: true, paid: true, code: consult.code });
    }

    const result = await verifySkinPayment(reference);
    if (!result.success) {
      return NextResponse.json({ success: false, paid: false, error: "Payment not completed yet." }, { status: 402 });
    }

    // Idempotent finalisation — only the first caller flips the status and notifies
    const updated = await prisma.skinConsult.updateMany({
      where: { id: consult.id, status: "awaiting_payment" },
      data: {
        is_paid: true,
        status: "new",
        amount_paid: result.amountNaira,
        paid_at: new Date(),
      },
    });

    if (updated.count === 1) {
      const fresh = await prisma.skinConsult.findUnique({ where: { id: consult.id } });
      if (fresh) await notifySkinConsult(fresh);
    }

    return NextResponse.json({ success: true, paid: true, code: consult.code });
  } catch (err) {
    console.error("[skin/verify]", err);
    return NextResponse.json({ error: "Could not verify payment. Please try again." }, { status: 500 });
  }
}
