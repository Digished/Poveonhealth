export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

async function verifyAdmin() {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  return await prisma.adminUser.findUnique({ where: { user_id: user.id } }) ? user : null;
}

/**
 * POST /api/admin/wallet/credit
 * Body: { reference: string }
 *
 * Verifies a Paystack reference and credits the lab wallet.
 * For missed webhook payments.
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { reference } = await req.json().catch(() => ({}));
  if (!reference?.trim()) return NextResponse.json({ error: "Paystack reference required." }, { status: 400 });

  const pRes  = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const pData = await pRes.json();

  if (!pData.status || pData.data?.status !== "success") {
    return NextResponse.json({ error: pData.message ?? "Transaction not found or not successful." }, { status: 422 });
  }

  const tx           = pData.data;
  const amountNaira  = Number(tx.amount) / 100;
  const customerCode = tx.customer?.customer_code ?? "";
  const dvaAccNum    = tx.dedicated_account?.account_number ?? tx.authorization?.receiver_bank_account_number ?? "";

  let wallet = customerCode
    ? await prisma.labWallet.findUnique({ where: { paystack_customer_id: customerCode } })
    : null;
  if (!wallet && dvaAccNum) {
    wallet = await prisma.labWallet.findFirst({ where: { dva_account_number: dvaAccNum } });
  }
  if (!wallet) {
    return NextResponse.json({ error: `No wallet found. customer="${customerCode}" dva="${dvaAccNum}"` }, { status: 404 });
  }

  const already = await prisma.labWalletCredit.findUnique({ where: { reference } });
  if (already) return NextResponse.json({ error: "Already credited.", already_credited: true }, { status: 409 });

  // Estimate balance_after for the credit record snapshot.
  // The actual balance is updated atomically below — wallet.balance is the source of truth.
  const estimatedBalanceAfter = Number(wallet.balance) + amountNaira;

  // Sender info lives in authorization for DVA bank transfers
  const auth = tx.authorization as Record<string, string> | null;
  const senderName = auth?.sender_name ?? null;
  const senderBank = auth?.sender_bank ?? null;

  await prisma.labWalletCredit.create({
    data: {
      wallet_id:     wallet.id,
      amount:        amountNaira,
      balance_after: estimatedBalanceAfter,
      reference,
      channel:      "manual",
      sender_name:  senderName,
      sender_bank:  senderBank,
    },
  });

  // Atomic increment — prevents race conditions if multiple manual credits run concurrently
  await prisma.labWallet.update({
    where: { id: wallet.id },
    data:  { balance: { increment: amountNaira } },
  });

  const updated = await prisma.labWallet.findUnique({ where: { id: wallet.id }, select: { balance: true } });
  const newBalance = Number(updated?.balance ?? estimatedBalanceAfter);

  return NextResponse.json({ success: true, amount: amountNaira, new_balance: newBalance });
}
