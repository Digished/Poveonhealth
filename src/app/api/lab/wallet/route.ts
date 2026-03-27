export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/lab/wallet — current wallet balance, DVA details, and transaction history */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.permissions.can_view_wallet) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [wallet, transactions] = await Promise.all([
    prisma.labWallet.findUnique({ where: { lab_id: auth.lab_id } }),
    prisma.walletTransaction.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: { created_at: "desc" },
      take: 200,
      include: {
        request: { select: { test_breakdown: true, tests: true } },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    balance: wallet ? Number(wallet.balance) : 0,
    dva: wallet?.dva_account_number
      ? {
          bank_name: wallet.dva_bank_name,
          account_number: wallet.dva_account_number,
          account_name: wallet.dva_account_name,
        }
      : null,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      direction: t.direction,
      amount: Number(t.amount),
      balance_after: Number(t.balance_after),
      description: t.description,
      reference: t.reference,
      actor_email: t.actor_email,
      created_at: t.created_at,
      request_id: t.request_id,
      test_breakdown: t.request?.test_breakdown ?? null,
      tests_raw: t.request?.tests ?? null,
    })),
  });
}
