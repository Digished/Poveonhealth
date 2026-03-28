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

    const [totalsRaw, byLabRaw, walletBalancesRaw, dvaTotalsRaw, recentRaw] = await Promise.all([
      // Platform-wide commission totals from requests
      prisma.$queryRaw<[{ poveon_sum: string; revenue_sum: string }]>`
        SELECT COALESCE(SUM(poveon_amount),0)::text AS poveon_sum,
               COALESCE(SUM(lab_revenue_amount),0)::text AS revenue_sum
        FROM requests WHERE status IN ('seen','done')`,

      // Per-lab commission totals
      prisma.$queryRaw<Array<{ lab_id: string; poveon_sum: string; revenue_sum: string; req_count: string }>>`
        SELECT lab_id,
               COALESCE(SUM(poveon_amount),0)::text AS poveon_sum,
               COALESCE(SUM(lab_revenue_amount),0)::text AS revenue_sum,
               COUNT(id)::text AS req_count
        FROM requests WHERE status IN ('seen','done')
        GROUP BY lab_id`,

      // Per-lab wallet balances (current position)
      prisma.$queryRaw<Array<{ lab_id: string; balance: string }>>`
        SELECT lab_id, balance::text AS balance FROM lab_wallets`,

      // Per-lab total DVA deposited (actual cash received from each lab)
      prisma.$queryRaw<Array<{ lab_id: string; deposited: string }>>`
        SELECT lw.lab_id, COALESCE(SUM(lwc.amount),0)::text AS deposited
        FROM lab_wallets lw
        LEFT JOIN lab_wallet_credits lwc ON lwc.wallet_id = lw.id
        GROUP BY lw.lab_id`,

      // Recent seen/done requests
      prisma.$queryRaw<Array<{
        id: string; code: string; lab_id: string; patient_name: string | null;
        tests: string; poveon_amount: string; lab_revenue_amount: string;
        is_paid_to_poveon: boolean; seen_at: Date | null;
      }>>`
        SELECT r.id, r.code, r.lab_id, r.patient_name, r.tests,
               COALESCE(r.poveon_amount,0)::text AS poveon_amount,
               COALESCE(r.lab_revenue_amount,0)::text AS lab_revenue_amount,
               r.is_paid_to_poveon, r.seen_at
        FROM requests r
        WHERE r.status IN ('seen','done')
        ORDER BY r.seen_at DESC NULLS LAST
        LIMIT 50`,
    ]);

    const labIds = byLabRaw.map((r) => r.lab_id);
    const labs = await prisma.lab.findMany({ where: { id: { in: labIds } }, select: { id: true, name: true } });
    const labNameMap = Object.fromEntries(labs.map((l) => [l.id, l.name]));

    const walletBalanceMap: Record<string, number> = Object.fromEntries(
      walletBalancesRaw.map((r) => [r.lab_id, Number(r.balance)])
    );
    const dvaDepositedMap: Record<string, number> = Object.fromEntries(
      dvaTotalsRaw.map((r) => [r.lab_id, Number(r.deposited)])
    );

    const byLab = byLabRaw.map((row) => {
      const totalCommission = Number(row.poveon_sum);
      const totalDeposited  = dvaDepositedMap[row.lab_id] ?? 0;
      const walletBalance   = walletBalanceMap[row.lab_id] ?? null; // null = no wallet provisioned
      return {
        lab_id:              row.lab_id,
        lab_name:            labNameMap[row.lab_id] ?? row.lab_id,
        request_count:       Number(row.req_count),
        total_poveon_amount: totalCommission,
        total_lab_revenue:   Number(row.revenue_sum),
        total_deposited:     totalDeposited,
        wallet_balance:      walletBalance,
      };
    }).sort((a, b) => (a.wallet_balance ?? 0) - (b.wallet_balance ?? 0)); // most indebted first

    const totalPoveonEarned = Number(totalsRaw[0]?.poveon_sum ?? 0);
    const totalLabRevenue   = Number(totalsRaw[0]?.revenue_sum ?? 0);
    // Total cash actually received from labs = sum of all DVA credits across all wallets
    const totalReceived = dvaTotalsRaw.reduce((sum, r) => sum + Number(r.deposited), 0);

    const recentLabIds = Array.from(new Set(recentRaw.map((r) => r.lab_id)));
    const recentLabs = await prisma.lab.findMany({ where: { id: { in: recentLabIds } }, select: { id: true, name: true } });
    const recentLabMap = Object.fromEntries(recentLabs.map((l) => [l.id, l.name]));

    return NextResponse.json({
      success: true,
      total_poveon_earned:  totalPoveonEarned, // cumulative commission accrued
      total_lab_revenue:    totalLabRevenue,
      total_received:       totalReceived,     // actual cash received from all lab DVA payments
      total_outstanding:    totalPoveonEarned - totalReceived, // net still owed to Poveon
      by_lab:               byLab,
      recent_requests: recentRaw.map((r) => ({
        id:                r.id,
        code:              r.code,
        lab_id:            r.lab_id,
        lab_name:          recentLabMap[r.lab_id] ?? r.lab_id,
        patient_name:      r.patient_name,
        tests:             r.tests,
        poveon_amount:     Number(r.poveon_amount),
        lab_revenue_amount: Number(r.lab_revenue_amount),
        is_paid_to_poveon: r.is_paid_to_poveon,
        seen_at:           r.seen_at,
      })),
    });
  } catch (error) {
    console.error("[admin/revenue]", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
