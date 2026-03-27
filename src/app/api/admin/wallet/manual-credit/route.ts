import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * POST /api/admin/wallet/manual-credit
 * Verify a Paystack reference and credit the matching lab wallet.
 * Fetches live transaction data from Paystack — no manual amount entry needed.
 * Body: { reference: string }
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { reference } = await req.json().catch(() => ({}));
  if (!reference?.trim()) {
    return NextResponse.json({ error: "Paystack reference is required." }, { status: 400 });
  }

  // 1. Verify transaction with Paystack
  const pRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const pData = await pRes.json();

  if (!pData.status || pData.data?.status !== "success") {
    return NextResponse.json({ error: `Paystack: ${pData.message ?? "Transaction not found or not successful."}` }, { status: 422 });
  }

  const tx = pData.data;
  const amountNaira = new Decimal(tx.amount).div(100);
  const customerCode: string = tx.customer?.customer_code ?? "";
  const dvaAccountNumber: string = tx.authorization?.receiver_bank_account_number ?? tx.dedicated_account?.account_number ?? "";

  // 2. Find lab wallet
  let wallet = customerCode
    ? await prisma.labWallet.findUnique({ where: { paystack_customer_id: customerCode } })
    : null;

  if (!wallet && dvaAccountNumber) {
    wallet = await prisma.labWallet.findFirst({ where: { dva_account_number: dvaAccountNumber } });
  }

  if (!wallet) {
    return NextResponse.json({ error: `No lab wallet found for this transaction. Customer: ${customerCode}, DVA: ${dvaAccountNumber}` }, { status: 404 });
  }

  // 3. Idempotency check
  const existing = await prisma.walletTransaction.findUnique({ where: { reference } });
  if (existing) {
    return NextResponse.json({ error: "This reference has already been credited.", already_credited: true }, { status: 409 });
  }

  // 4. Credit wallet
  const senderBank: string = tx.authorization?.bank ?? tx.authorization?.sender_bank ?? "";
  const senderName: string = tx.metadata?.sender_name ?? "";
  const description = ["Top-up", senderBank && `via ${senderBank}`, senderName && `— ${senderName}`].filter(Boolean).join(" ");

  await prisma.$transaction(async (t) => {
    const newBalance = new Decimal(wallet!.balance).add(amountNaira);
    await t.labWallet.update({
      where: { lab_id: wallet!.lab_id },
      data: { balance: newBalance },
    });
    await t.walletTransaction.create({
      data: {
        lab_id: wallet!.lab_id,
        type: "topup",
        direction: "credit",
        amount: amountNaira,
        balance_after: newBalance,
        description: `[Manual] ${description}`,
        reference,
        actor_email: admin.email ?? "admin",
      },
    });
    if (customerCode && !wallet!.paystack_customer_id) {
      await t.labWallet.update({
        where: { lab_id: wallet!.lab_id },
        data: { paystack_customer_id: customerCode },
      });
    }
  });

  return NextResponse.json({ success: true, amount: Number(amountNaira), lab_id: wallet.lab_id });
}
