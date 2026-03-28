export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Log every incoming call so we can diagnose in Vercel function logs
  console.log(`[webhook] received POST — body length=${raw.length} has-sig=${!!req.headers.get("x-paystack-signature")}`);

  // Verify HMAC-SHA512 signature
  const sig      = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", SECRET).update(raw).digest("hex");
  if (sig !== expected) {
    console.error(`[webhook] signature mismatch — got="${sig.slice(0, 16)}…" expected="${expected.slice(0, 16)}…" SECRET_SET=${!!SECRET}`);
    return NextResponse.json({ ok: true });
  }

  let body: { event: string; data: Record<string, unknown> };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  const { event, data } = body;

  // Only process successful DVA (dedicated virtual account) payments
  const channel = String(data.channel ?? "");
  console.log(`[webhook] event=${event} channel=${channel} amount=${data.amount} ref=${data.reference}`);

  if (event !== "charge.success" || channel !== "dedicated_nuban") {
    return NextResponse.json({ ok: true });
  }

  const reference   = String(data.reference ?? "");
  const amountNaira = Number(data.amount ?? 0) / 100;
  if (!reference || amountNaira <= 0) return NextResponse.json({ ok: true });

  // Locate the lab wallet — try customer_code first, fall back to DVA account number.
  // Note: Paystack does NOT always include a dedicated_account object in the payload.
  // The receiver account number appears in authorization.receiver_bank_account_number
  // and metadata.receiver_account_number instead.
  const customerCode = (data.customer as Record<string, string> | null)?.customer_code ?? "";
  const meta = data.metadata as Record<string, string> | null;
  const auth = data.authorization as Record<string, string> | null;
  const dvaAccNum =
    (data.dedicated_account as Record<string, string> | null)?.account_number ??
    auth?.receiver_bank_account_number ??
    meta?.receiver_account_number ??
    "";

  console.log(`[webhook] lookup — customer_code=${customerCode} dva_acc=${dvaAccNum}`);

  let wallet = customerCode
    ? await prisma.labWallet.findUnique({ where: { paystack_customer_id: customerCode } })
    : null;
  if (!wallet && dvaAccNum) {
    wallet = await prisma.labWallet.findFirst({ where: { dva_account_number: dvaAccNum } });
  }
  if (!wallet) {
    console.error(`[webhook] no wallet found — customer=${customerCode} dva=${dvaAccNum}`);
    return NextResponse.json({ ok: true });
  }

  // Idempotency — skip if this reference was already credited
  const already = await prisma.labWalletCredit.findUnique({ where: { reference } });
  if (already) {
    console.log(`[webhook] duplicate reference ${reference} — already credited`);
    return NextResponse.json({ ok: true });
  }

  // auth already extracted above for DVA account number lookup
  const senderName = auth?.sender_name ?? null;
  const senderBank = auth?.sender_bank ?? null;

  // Create credit record first — this is the idempotency anchor.
  // balance_after is an estimate; balance update below is atomic so the true
  // running balance is always wallet.balance, not this snapshot field.
  const estimatedBalanceAfter = Number(wallet.balance) + amountNaira;

  await prisma.labWalletCredit.create({
    data: {
      wallet_id:     wallet.id,
      amount:        amountNaira,
      balance_after: estimatedBalanceAfter,
      reference,
      channel:       "dva",
      sender_name:   senderName,
      sender_bank:   senderBank,
    },
  });

  // Atomically increment balance — prevents race conditions when multiple
  // payments arrive simultaneously (avoids read-modify-write overwrite).
  try {
    await prisma.labWallet.update({
      where: { id: wallet.id },
      data:  { balance: { increment: amountNaira } },
    });
    console.log(`[webhook] ✓ ₦${amountNaira} credited to lab ${wallet.lab_id} (ref: ${reference})`);
  } catch (err) {
    // Credit record exists but balance wasn't updated.
    // The admin manual-credit endpoint can resync if needed.
    console.error(`[webhook] balance update failed for ref ${reference}:`, err);
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Paystack webhook is live" });
}
