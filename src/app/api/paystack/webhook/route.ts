export const dynamic = "force-dynamic";

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
  console.log("[webhook] Received — body length:", rawBody.length);

  // 1. Verify signature
  const sig = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", SECRET).update(rawBody).digest("hex");

  if (sig !== expected) {
    console.error("[webhook] Signature mismatch. Got:", sig.slice(0, 16), "Expected:", expected.slice(0, 16));
    // Return 200 anyway so Paystack doesn't keep retrying — log and bail
    return NextResponse.json({ received: true, error: "bad_sig" });
  }

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error("[webhook] Failed to parse JSON");
    return NextResponse.json({ received: true, error: "bad_json" });
  }

  console.log("[webhook] Event:", event.event, "| Channel:", (event.data as Record<string, unknown>)?.channel);

  // 2. Only process charge.success
  if (event.event !== "charge.success") {
    console.log("[webhook] Ignored event:", event.event);
    return NextResponse.json({ received: true });
  }

  const data = event.data;
  const channel = (data.channel as string) ?? "";

  // Accept dedicated_nuban — log the actual channel so we can debug
  if (!channel.includes("nuban") && channel !== "dedicated_nuban") {
    console.log("[webhook] Skipped non-DVA channel:", channel);
    return NextResponse.json({ received: true, skipped_channel: channel });
  }

  const reference = data.reference as string;
  const amountKobo = data.amount as number;
  const amountNaira = new Decimal(amountKobo).div(100);
  const customer = data.customer as Record<string, string>;
  const customerCode = customer?.customer_code;

  console.log("[webhook] DVA payment — ref:", reference, "amount: ₦", amountNaira.toString(), "customer:", customerCode);

  if (!customerCode) {
    console.error("[webhook] No customer_code in payload");
    return NextResponse.json({ received: true });
  }

  // 3. Find lab wallet — try customer_code first, then fall back to DVA account number
  let wallet = await prisma.labWallet.findUnique({
    where: { paystack_customer_id: customerCode },
  });

  if (!wallet) {
    // Paystack DVA webhooks include a dedicated_account object — try matching on account number
    const dedicatedAccount = data.dedicated_account as Record<string, unknown> | null;
    const dvaAccountNumber = (dedicatedAccount?.account_number as string) ?? "";
    if (dvaAccountNumber) {
      wallet = await prisma.labWallet.findFirst({
        where: { dva_account_number: dvaAccountNumber },
      });
      if (wallet) {
        console.log("[webhook] Found wallet via DVA account number:", dvaAccountNumber);
        // Backfill customer code for future lookups
        await prisma.labWallet.update({
          where: { lab_id: wallet.lab_id },
          data: { paystack_customer_id: customerCode },
        });
      }
    }
  }

  if (!wallet) {
    console.error("[webhook] No wallet found for customer_code:", customerCode);
    return NextResponse.json({ received: true });
  }

  // 4. Idempotency — skip if reference already recorded
  const existing = await prisma.walletTransaction.findUnique({ where: { reference } });
  if (existing) {
    console.log("[webhook] Duplicate reference, skipping:", reference);
    return NextResponse.json({ received: true, skipped: "duplicate" });
  }

  // 5. Credit wallet atomically
  const paidBy = (data.metadata as Record<string, string> | null)?.sender_name ?? "";
  const authorization = data.authorization as Record<string, string> | null;
  const senderBank = authorization?.bank ?? authorization?.sender_bank ?? "";
  const description = [
    "Top-up",
    senderBank && `via ${senderBank}`,
    paidBy && `— ${paidBy}`,
  ].filter(Boolean).join(" ");

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

  console.log(`[webhook] ✓ Credited ₦${amountNaira} to lab ${wallet.lab_id}`);
  return NextResponse.json({ received: true });
}

/** GET — liveness check so you can verify the URL is reachable */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "Paystack webhook receiver is live" });
}
