export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/lab/wallet — current wallet balance + transaction history */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.permissions.can_view_wallet) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [wallet, transactions, revealPriceSetting] = await Promise.all([
    prisma.labWallet.findUnique({ where: { lab_id: auth.lab_id } }),
    prisma.walletTransaction.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: { created_at: "desc" },
      take: 200,
    }),
    prisma.systemSetting.findUnique({ where: { key: "reveal_price" } }),
  ]);

  return NextResponse.json({
    success: true,
    balance: wallet ? Number(wallet.balance) : 0,
    reveal_price: revealPriceSetting ? parseFloat(revealPriceSetting.value) : 500,
    transactions: transactions.map((t) => ({
      ...t,
      amount: Number(t.amount),
      balance_after: Number(t.balance_after),
    })),
  });
}
