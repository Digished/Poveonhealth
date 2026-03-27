export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/lab/wallet
 *
 * Returns:
 *  - balance: current wallet balance (can be negative = lab owes Poveon)
 *  - dva: dedicated virtual account details (null if not provisioned)
 *  - transactions: full ledger, newest first
 *    - credits = DVA top-ups from Paystack
 *    - debits  = commission deductions when requests are marked Seen
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.permissions.can_view_wallet) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [wallet, transactions] = await Promise.all([
    prisma.labWallet.findUnique({ where: { lab_id: auth.lab_id } }),
    prisma.walletTransaction.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: { created_at: "desc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    success: true,
    balance: wallet ? Number(wallet.balance) : 0,
    dva: wallet?.dva_account_number
      ? {
          bank_name: wallet.dva_bank_name ?? "",
          account_number: wallet.dva_account_number,
          account_name: wallet.dva_account_name ?? "",
        }
      : null,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,           // "topup" | "deduction"
      direction: t.direction, // "credit" | "debit"
      amount: Number(t.amount),
      balance_after: Number(t.balance_after),
      description: t.description,
      reference: t.reference,
      request_id: t.request_id,
      created_at: t.created_at,
    })),
  });
}
