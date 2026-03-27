export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

export async function POST(req: NextRequest) {
  const raw = await req.text();

  const sig      = req.headers.get("x-paystack-signature") ?? "";
  const expected = createHmac("sha512", SECRET).update(raw).digest("hex");
  if (sig !== expected) {
    console.error("[webhook] bad signature");
    return NextResponse.json({ ok: true });
  }

  let body: { event: string; data: Record<string, unknown> };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  const { event, data } = body;
  const channel = String(data.channel ?? "");
  console.log(`[webhook] event=${event} channel=${channel}`);

  if (event !== "charge.success" || !channel.includes("nuban")) {
    return NextResponse.json({ ok: true });
  }

  const reference   = String(data.reference ?? "");
  const amountNaira = Number(data.amount ?? 0) / 100;
  if (!reference || amountNaira <= 0) return NextResponse.json({ ok: true });

  // Find wallet by customer_code, fall back to dva_account_number
  const customerCode = (data.customer as Record<string, string> | null)?.customer_code ?? "";
  const dvaAccNum    = (data.dedicated_account as Record<string, string> | null)?.account_number ?? "";

  let wallet = customerCode
    ? await prisma.labWallet.findUnique({ where: { paystack_customer_id: customerCode } })
    : null;
  if (!wallet && dvaAccNum) {
    wallet = await prisma.labWallet.findFirst({ where: { dva_account_number: dvaAccNum } });
  }
  if (!wallet) {
    console.error(`[webhook] no wallet — customer=${customerCode} dva=${dvaAccNum}`);
    return NextResponse.json({ ok: true });
  }

  // Idempotency
  const already = await prisma.labWalletCredit.findUnique({ where: { reference } });
  if (already) { console.log(`[webhook] duplicate ${reference}`); return NextResponse.json({ ok: true }); }

  const auth = data.authorization as Record<string, string> | null;
  const meta = data.metadata      as Record<string, string> | null;
  const newBalance = Number(wallet.balance) + amountNaira;

  await prisma.labWalletCredit.create({
    data: {
      wallet_id:     wallet.id,
      amount:        amountNaira,
      balance_after: newBalance,
      reference,
      channel:       "dva",
      sender_name:   meta?.sender_name ?? null,
      sender_bank:   auth?.bank ?? auth?.sender_bank ?? null,
    },
  });

  await prisma.labWallet.update({
    where: { id: wallet.id },
    data:  { balance: newBalance },
  });

  console.log(`[webhook] ✓ ₦${amountNaira} credited to lab ${wallet.lab_id}`);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Paystack webhook is live" });
}
