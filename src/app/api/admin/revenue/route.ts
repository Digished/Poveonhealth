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

    const [totalsRaw, byLabRaw, walletBalancesRaw, dvaTotalsRaw, recentRaw, recentDvaRaw] = await Promise.all([
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

      // Recent seen/done requests with commission
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

      // Recent DVA deposits across all labs — shows actual cash received
      prisma.$queryRaw<Array<{
        id: string; lab_id: string; amount: string; reference: string;
        channel: string; sender_name: string | null; sender_bank: string | null; created_at: Date;
      }>>`
        SELECT lwc.id, lw.lab_id, lwc.amount::text, lwc.reference,
               lwc.channel, lwc.sender_name, lwc.sender_bank, lwc.created_at
        FROM lab_wallet_credits lwc
        JOIN lab_wallets lw ON lw.id = lwc.wallet_id
        ORDER BY lwc.created_at DESC
        LIMIT 30`,
    ]);

    type CommissionRow = { lab_id: string; poveon_sum: string; revenue_sum: string; req_count: string };
    type WalletRow    = { lab_id: string; balance: string };
    type DvaRow       = { lab_id: string; deposited: string };
    type RecentRow    = { id: string; code: string; lab_id: string; patient_name: string | null; tests: string; poveon_amount: string; lab_revenue_amount: string; is_paid_to_poveon: boolean; seen_at: Date | null };
    type DvaCredit    = { id: string; lab_id: string; amount: string; reference: string; channel: string; sender_name: string | null; sender_bank: string | null; created_at: Date };

    // Build lookup maps
    const walletBalanceMap: Record<string, number> = Object.fromEntries(
      (walletBalancesRaw as WalletRow[]).map((r) => [r.lab_id, Number(r.balance)])
    );
    const dvaDepositedMap: Record<string, number> = Object.fromEntries(
      (dvaTotalsRaw as DvaRow[]).map((r) => [r.lab_id, Number(r.deposited)])
    );
    const commissionMap: Record<string, CommissionRow> = Object.fromEntries(
      (byLabRaw as CommissionRow[]).map((r) => [r.lab_id, r])
    );

    // Combine lab IDs from BOTH commission data and wallet data so labs with
    // deposits but no commission-bearing requests still appear in the breakdown
    const allLabIds = Array.from(new Set([
      ...(byLabRaw as CommissionRow[]).map((r) => r.lab_id),
      ...(walletBalancesRaw as WalletRow[]).map((r) => r.lab_id),
    ]));

    // Fetch names for all relevant lab IDs in one query
    const allRelevantIds = Array.from(new Set([
      ...allLabIds,
      ...(recentRaw as RecentRow[]).map((r) => r.lab_id),
      ...(recentDvaRaw as DvaCredit[]).map((r) => r.lab_id),
    ]));
    const labs = await prisma.lab.findMany({
      where: { id: { in: allRelevantIds } },
      select: { id: true, name: true },
    });
    const labNameMap: Record<string, string> = Object.fromEntries(
      labs.map((l: { id: string; name: string }) => [l.id, l.name])
    );

    const byLab = allLabIds.map((labId) => {
      const commission    = commissionMap[labId];
      const totalCommission = Number(commission?.poveon_sum ?? 0);
      const totalDeposited  = dvaDepositedMap[labId] ?? 0;
      const walletBalance   = walletBalanceMap[labId] ?? null; // null = no wallet
      // owed = how much the lab still needs to pay Poveon
      // - if wallet exists: negative balance = debt
      // - if no wallet: full commission is owed (no payment method to track)
      const owed = walletBalance !== null ? Math.max(0, -walletBalance) : totalCommission;
      return {
        lab_id:              labId,
        lab_name:            labNameMap[labId] ?? labId,
        request_count:       Number(commission?.req_count ?? 0),
        total_poveon_amount: totalCommission,
        total_lab_revenue:   Number(commission?.revenue_sum ?? 0),
        total_deposited:     totalDeposited,
        wallet_balance:      walletBalance,
        owed,
      };
    }).sort((a, b) => b.owed - a.owed); // most indebted first

    const totalPoveonEarned = Number(totalsRaw[0]?.poveon_sum ?? 0);
    const totalLabRevenue   = Number(totalsRaw[0]?.revenue_sum ?? 0);
    const totalReceived     = (dvaTotalsRaw as DvaRow[]).reduce((sum: number, r: DvaRow) => sum + Number(r.deposited), 0);
    // Cap at 0 — if labs have deposited more than commission, show 0 not negative
    const totalOutstanding  = Math.max(0, totalPoveonEarned - totalReceived);

    return NextResponse.json({
      success: true,
      total_poveon_earned: totalPoveonEarned,
      total_lab_revenue:   totalLabRevenue,
      total_received:      totalReceived,
      total_outstanding:   totalOutstanding,
      by_lab:              byLab,
      recent_requests: (recentRaw as RecentRow[]).map((r) => ({
        id:                 r.id,
        code:               r.code,
        lab_id:             r.lab_id,
        lab_name:           labNameMap[r.lab_id] ?? r.lab_id,
        patient_name:       r.patient_name,
        tests:              r.tests,
        poveon_amount:      Number(r.poveon_amount),
        lab_revenue_amount: Number(r.lab_revenue_amount),
        is_paid_to_poveon:  r.is_paid_to_poveon,
        seen_at:            r.seen_at,
      })),
      recent_dva_credits: (recentDvaRaw as DvaCredit[]).map((r) => ({
        id:          r.id,
        lab_id:      r.lab_id,
        lab_name:    labNameMap[r.lab_id] ?? r.lab_id,
        amount:      Number(r.amount),
        reference:   r.reference,
        channel:     r.channel,
        sender_name: r.sender_name,
        sender_bank: r.sender_bank,
        created_at:  r.created_at,
      })),
    });
  } catch (error) {
    console.error("[admin/revenue]", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
