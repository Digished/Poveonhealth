export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import { jsonWithEtag, makeEtag, notModified } from "@/lib/http-cache";

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [totalsRaw, requestsRaw, wallet] = await Promise.all([
    prisma.$queryRaw<[{ poveon_sum: string; revenue_sum: string }]>`
      SELECT COALESCE(SUM(poveon_amount),0)::text AS poveon_sum,
             COALESCE(SUM(lab_revenue_amount),0)::text AS revenue_sum
      FROM requests
      WHERE lab_id = ${auth.lab_id} AND status IN ('seen','done')`,

    prisma.$queryRaw<Array<{
      id: string; code: string; patient_name: string | null; tests: string;
      poveon_amount: string; lab_revenue_amount: string;
      is_paid_to_poveon: boolean; seen_at: Date | null; completed_at: Date | null;
      test_breakdown: unknown;
    }>>`
      SELECT id, code, patient_name, tests,
             COALESCE(poveon_amount,0)::text AS poveon_amount,
             COALESCE(lab_revenue_amount,0)::text AS lab_revenue_amount,
             is_paid_to_poveon, seen_at, completed_at,
             test_breakdown
      FROM requests
      WHERE lab_id = ${auth.lab_id} AND status IN ('seen','done')
      ORDER BY seen_at DESC NULLS LAST
      LIMIT 100`,

    // Wallet balance + total DVA deposits — the real financial position
    prisma.labWallet.findUnique({
      where: { lab_id: auth.lab_id },
      include: { credits: { select: { amount: true } } },
    }),
  ]);

  const etag = makeEtag([
    "lab-poveon", auth.lab_id,
    totalsRaw[0]?.poveon_sum, totalsRaw[0]?.revenue_sum,
    requestsRaw.length, requestsRaw[0]?.id, requestsRaw[0]?.seen_at,
    wallet?.balance?.toString(), wallet?.credits.length,
  ]);
  const cached = notModified(request, etag);
  if (cached) return cached;

  const totalOwed     = Number(totalsRaw[0]?.poveon_sum   ?? 0);
  const totalRevenue  = Number(totalsRaw[0]?.revenue_sum  ?? 0);
  const walletBalance = wallet ? Number(wallet.balance) : 0;
  const totalDeposited = wallet
    ? wallet.credits.reduce((sum, c) => sum + Number(c.amount), 0)
    : 0;

  return jsonWithEtag({
    success: true,
    total_owed:        totalOwed,       // cumulative Poveon commission accrued
    total_lab_revenue: totalRevenue,    // lab's cumulative revenue
    total_deposited:   totalDeposited,  // total cash deposited into wallet via DVA
    wallet_balance:    walletBalance,   // current position: positive = credit, negative = owed
    requests: requestsRaw.map((r) => ({
      id:                r.id,
      code:              r.code,
      patient_name:      r.patient_name,
      tests:             r.tests,
      poveon_amount:     Number(r.poveon_amount),
      lab_revenue_amount: Number(r.lab_revenue_amount),
      is_paid_to_poveon: r.is_paid_to_poveon,
      seen_at:           r.seen_at,
      completed_at:      r.completed_at,
      test_breakdown:    Array.isArray(r.test_breakdown) ? r.test_breakdown : [],
    })),
  }, etag);
}
