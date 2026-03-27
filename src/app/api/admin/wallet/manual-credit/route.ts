import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const SECRET = process.env.PAYSTACK_SECRET_KEY!;

async function verifyAdmin() {
  const client = await createServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const record = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return record ? user : null;
}

/**
 * POST /api/admin/wallet/manual-credit
 *
 * Verifies a Paystack transaction reference and credits the matching lab wallet.
 * Used when a DVA payment was received but the webhook didn't fire (or failed).
 *
 * Body: { reference: string }
 *
 * - Fetches live transaction data from Paystack API (no manual amount needed)
 * - Finds wallet by customer_code or dva_account_number from the Paystack response
 * - Idempotent: rejects already-credited references
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const reference: string = (body.reference ?? "").trim();
  if (!reference) return NextResponse.json({ error: "Paystack reference is required." }, { status: 400 });

  // Verify with Paystack
  const pRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${SECRET}` },
  });
  const pData = await pRes.json();

  if (!pData.status || pData.data?.status !== "success") {
    return NextResponse.json({ error: `Paystack: ${pData.message ?? "Transaction not found or not successful."}` }, { status: 422 });
  }

  const tx = pData.data;
  const amountNaira: number = tx.amount / 100;
  const customerCode: string = tx.customer?.customer_code ?? "";
  const dvaAccountNumber: string =
    tx.dedicated_account?.account_number ??
    tx.authorization?.receiver_bank_account_number ?? "";

  // Find wallet
  let wallet = customerCode
    ? await prisma.labWallet.findUnique({ where: { paystack_customer_id: customerCode } })
    : null;
  if (!wallet && dvaAccountNumber) {
    wallet = await prisma.labWallet.findFirst({ where: { dva_account_number: dvaAccountNumber } });
  }
  if (!wallet) {
    return NextResponse.json({
      error: `No lab wallet found for this transaction. customer_code="${customerCode}" dva_account="${dvaAccountNumber}"`,
    }, { status: 404 });
  }

  // Idempotency
  const existing = await prisma.walletTransaction.findUnique({ where: { reference } });
  if (existing) {
    return NextResponse.json({ error: "This reference has already been credited.", already_credited: true }, { status: 409 });
  }

  const auth = tx.authorization as Record<string, string> | null;
  const meta = tx.metadata as Record<string, string> | null;
  const description = [
    "[Manual]",
    auth?.bank ? `from ${auth.bank}` : "Bank transfer",
    meta?.sender_name ? `by ${meta.sender_name}` : "",
  ].filter(Boolean).join(" ");

  // Atomic credit (same pattern as webhook — PgBouncer-safe raw SQL)
  await prisma.$executeRawUnsafe(
    `INSERT INTO wallet_transactions (id, lab_id, type, direction, amount, balance_after, description, reference, actor_email, created_at)
     VALUES (gen_random_uuid(), $1, 'topup', 'credit', $2,
             (SELECT balance FROM lab_wallets WHERE lab_id = $1) + $2,
             $3, $4, $5, NOW())`,
    wallet.lab_id, amountNaira, description, reference, admin.email ?? "admin",
  );
  await prisma.$executeRawUnsafe(
    `UPDATE lab_wallets SET balance = balance + $1, updated_at = NOW() WHERE lab_id = $2`,
    amountNaira, wallet.lab_id,
  );

  // Backfill customer_code if missing
  if (customerCode && !wallet.paystack_customer_id) {
    await prisma.$executeRawUnsafe(
      `UPDATE lab_wallets SET paystack_customer_id = $1 WHERE lab_id = $2`,
      customerCode, wallet.lab_id,
    );
  }

  const updated = await prisma.labWallet.findUnique({ where: { lab_id: wallet.lab_id } });
  return NextResponse.json({ success: true, amount: amountNaira, new_balance: Number(updated?.balance ?? 0), lab_id: wallet.lab_id });
}
