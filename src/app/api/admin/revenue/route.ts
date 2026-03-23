export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

    const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
    if (!adminRecord) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    // Aggregate all wallet transactions
    const [totalCreditsAgg, totalDebitsAgg, recentTx, wallets] = await Promise.all([
      prisma.walletTransaction.aggregate({ _sum: { amount: true }, where: { direction: "credit" } }),
      prisma.walletTransaction.aggregate({ _sum: { amount: true }, where: { direction: "debit" } }),
      prisma.walletTransaction.findMany({
        orderBy: { created_at: "desc" },
        take: 50,
        include: { lab: { select: { name: true } } },
      }),
      prisma.labWallet.findMany({
        include: { lab: { select: { name: true } } },
        orderBy: { balance: "asc" },
      }),
    ]);

    // Revenue breakdown by lab (total credits per lab)
    const creditsByLab = await prisma.walletTransaction.groupBy({
      by: ["lab_id"],
      _sum: { amount: true },
      where: { direction: "credit" },
    });
    const debitsByLab = await prisma.walletTransaction.groupBy({
      by: ["lab_id"],
      _sum: { amount: true },
      where: { direction: "debit" },
    });

    // Build lab name map
    const labIds = Array.from(new Set([...creditsByLab.map((r) => r.lab_id), ...debitsByLab.map((r) => r.lab_id)]));
    const labs = await prisma.lab.findMany({ where: { id: { in: labIds } }, select: { id: true, name: true } });
    const labNameMap = Object.fromEntries(labs.map((l) => [l.id, l.name]));

    const creditMap: Record<string, number> = Object.fromEntries(creditsByLab.map((r) => [r.lab_id, Number(r._sum.amount ?? 0)]));
    const debitMap: Record<string, number> = Object.fromEntries(debitsByLab.map((r) => [r.lab_id, Number(r._sum.amount ?? 0)]));

    const byLab = Array.from(new Set([...Object.keys(creditMap), ...Object.keys(debitMap)])).map((labId) => ({
      lab_id: labId,
      lab_name: labNameMap[labId] ?? labId,
      total_credited: creditMap[labId] ?? 0,
      total_debited: debitMap[labId] ?? 0,
      balance: wallets.find((w) => w.lab_id === labId)?.balance ?? 0,
    })).sort((a, b) => b.total_debited - a.total_debited);

    return NextResponse.json({
      success: true,
      total_credited: Number(totalCreditsAgg._sum.amount ?? 0),
      total_debited: Number(totalDebitsAgg._sum.amount ?? 0),
      wallets: wallets.map((w) => ({ lab_id: w.lab_id, lab_name: w.lab?.name ?? w.lab_id, balance: Number(w.balance) })),
      recent_transactions: recentTx.map((t) => ({
        id: t.id,
        lab_id: t.lab_id,
        lab_name: t.lab?.name ?? t.lab_id,
        type: t.type,
        direction: t.direction,
        amount: Number(t.amount),
        balance_after: Number(t.balance_after),
        description: t.description,
        created_at: t.created_at,
      })),
      by_lab: byLab,
    });
  } catch (error) {
    console.error("[admin/revenue]", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
