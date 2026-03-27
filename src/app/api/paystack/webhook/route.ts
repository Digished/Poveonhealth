import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

/**
 * POST /api/paystack/webhook
 * Receives Paystack webhook events. Verifies HMAC-SHA512 signature.
 * On charge.success via dedicated_nuban, credits the matching lab wallet.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Verify signature
  const sig = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", SECRET).update(rawBody).digest("hex");
  if (sig !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 2. Only handle DVA top-ups
  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const data = event.data;
  const channel = data.channel as string;
  if (channel !== "dedicated_nuban") {
    return NextResponse.json({ received: true });
  }

  const reference = data.reference as string;
  const amountKobo = data.amount as number; // Paystack sends kobo
  const amountNaira = new Decimal(amountKobo).div(100);
  const customerCode = (data.customer as Record<string, string>).customer_code;

  // 3. Find lab wallet by customer code
  const wallet = await prisma.labWallet.findUnique({
    where: { paystack_customer_id: customerCode },
  });

  if (!wallet) {
    console.warn("[webhook] No wallet for customer:", customerCode);
    return NextResponse.json({ received: true });
  }

  // 4. Idempotency — skip if reference already recorded
  const existing = await prisma.walletTransaction.findUnique({
    where: { reference },
  });
  if (existing) {
    return NextResponse.json({ received: true, skipped: "duplicate" });
  }

  // 5. Credit wallet in a transaction
  const senderName = (data.metadata as Record<string, string> | null)?.sender_name ?? "Transfer";
  const channel_meta = data.authorization as Record<string, string> | null;
  const senderBank = channel_meta?.bank ?? null;
  const description = senderBank
    ? `Top-up via ${senderBank} — ${senderName}`
    : `Top-up — ${senderName}`;

  await prisma.$transaction(async (tx) => {
    const newBalance = new Decimal(wallet.balance).add(amountNaira);

    await tx.labWallet.update({
      where: { lab_id: wallet.lab_id },
      data: { balance: newBalance },
    });

    await tx.walletTransaction.create({
      data: {
        lab_id: wallet.lab_id,
        type: "topup",
        direction: "credit",
        amount: amountNaira,
        balance_after: newBalance,
        description,
        reference,
      },
    });
  });

  console.log(`[webhook] Credited ₦${amountNaira} to lab ${wallet.lab_id} (ref: ${reference})`);
  return NextResponse.json({ received: true });
}
