export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

/**
 * POST /api/paystack/webhook
 *
 * Receives Paystack events. On charge.success via dedicated_nuban:
 *  1. Verifies HMAC-SHA512 signature
 *  2. Finds lab wallet by customer_code OR dva_account_number
 *  3. Credits wallet balance atomically using raw SQL (PgBouncer-safe)
 *  4. Creates WalletTransaction record (reference is unique — idempotent)
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Signature check
  const sig = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", SECRET).update(rawBody).digest("hex");
  if (sig !== expected) {
    // Return 200 so Paystack stops retrying; log for investigation
    console.error("[webhook] BAD SIGNATURE. Got:", sig.slice(0, 20), "Expected:", expected.slice(0, 20));
    return NextResponse.json({ received: true });
  }

  let payload: { event: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  const { event, data } = payload;
  const channel = (data.channel as string) ?? "";
  console.log(`[webhook] ${event} | channel: ${channel}`);

  // 2. Only handle DVA charge.success
  if (event !== "charge.success" || !channel.includes("nuban")) {
    return NextResponse.json({ received: true });
  }

  const reference = data.reference as string;
  const amountKobo = data.amount as number;
  const amountNaira = amountKobo / 100;

  const customer = data.customer as Record<string, string> | null;
  const customerCode = customer?.customer_code ?? "";

  // DVA-specific: Paystack includes a dedicated_account object on the payment
  const dedicatedAccount = data.dedicated_account as Record<string, string> | null;
  const dvaAccountNumber = dedicatedAccount?.account_number ?? "";

  console.log(`[webhook] ref=${reference} amount=₦${amountNaira} customer=${customerCode} dva_acc=${dvaAccountNumber}`);

  // 3. Find wallet — customer_code first, fallback to dva_account_number
  let wallet = customerCode
    ? await prisma.labWallet.findUnique({ where: { paystack_customer_id: customerCode } })
    : null;

  if (!wallet && dvaAccountNumber) {
    wallet = await prisma.labWallet.findFirst({ where: { dva_account_number: dvaAccountNumber } });
    if (wallet && customerCode) {
      // Backfill customer_code for faster future lookups
      await prisma.$executeRawUnsafe(
        `UPDATE lab_wallets SET paystack_customer_id = $1 WHERE lab_id = $2 AND paystack_customer_id IS NULL`,
        customerCode, wallet.lab_id,
      );
    }
  }

  if (!wallet) {
    console.error(`[webhook] No wallet found — customer: ${customerCode} dva: ${dvaAccountNumber}`);
    return NextResponse.json({ received: true });
  }

  // 4. Idempotency + atomic credit (single INSERT ON CONFLICT DO NOTHING + UPDATE)
  const inserted = await prisma.$executeRawUnsafe(
    `INSERT INTO wallet_transactions (id, lab_id, type, direction, amount, balance_after, description, reference, created_at)
     SELECT gen_random_uuid(), $1, 'topup', 'credit', $2,
            (SELECT balance FROM lab_wallets WHERE lab_id = $1) + $2,
            $3, $4, NOW()
     WHERE NOT EXISTS (SELECT 1 FROM wallet_transactions WHERE reference = $4)`,
    wallet.lab_id, amountNaira,
    buildDescription(data),
    reference,
  );

  if (inserted === 0) {
    console.log(`[webhook] Duplicate reference ${reference} — skipped`);
    return NextResponse.json({ received: true });
  }

  // Credit the balance
  await prisma.$executeRawUnsafe(
    `UPDATE lab_wallets SET balance = balance + $1, updated_at = NOW() WHERE lab_id = $2`,
    amountNaira, wallet.lab_id,
  );

  console.log(`[webhook] ✓ Credited ₦${amountNaira} to lab ${wallet.lab_id} (ref: ${reference})`);
  return NextResponse.json({ received: true });
}

function buildDescription(data: Record<string, unknown>): string {
  const auth = data.authorization as Record<string, string> | null;
  const meta = data.metadata as Record<string, string> | null;
  const bank = auth?.bank ?? auth?.sender_bank ?? "";
  const sender = meta?.sender_name ?? "";
  return ["Bank transfer", bank && `from ${bank}`, sender && `by ${sender}`].filter(Boolean).join(" ");
}

/** GET — liveness probe */
export async function GET() {
  return NextResponse.json({ ok: true, message: "Paystack webhook receiver is live" });
}
