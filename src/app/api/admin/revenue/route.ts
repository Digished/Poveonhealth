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

    // Raw SQL for all commission fields — bypasses stale Prisma client
    const [totalsRaw, paidTotalRaw, byLabRaw, paidByLabRaw, recentRaw] = await Promise.all([
      prisma.$queryRaw<[{ poveon_sum: string; revenue_sum: string }]>`
        SELECT COALESCE(SUM(poveon_amount),0)::text AS poveon_sum,
               COALESCE(SUM(lab_revenue_amount),0)::text AS revenue_sum
        FROM requests WHERE status IN ('seen','done')`,

      prisma.$queryRaw<[{ paid_sum: string }]>`
        SELECT COALESCE(SUM(poveon_amount),0)::text AS paid_sum
        FROM requests WHERE is_paid_to_poveon = true`,

      prisma.$queryRaw<Array<{ lab_id: string; poveon_sum: string; revenue_sum: string; req_count: string }>>`
        SELECT lab_id,
               COALESCE(SUM(poveon_amount),0)::text AS poveon_sum,
               COALESCE(SUM(lab_revenue_amount),0)::text AS revenue_sum,
               COUNT(id)::text AS req_count
        FROM requests WHERE status IN ('seen','done')
        GROUP BY lab_id`,

      prisma.$queryRaw<Array<{ lab_id: string; paid_sum: string }>>`
        SELECT lab_id, COALESCE(SUM(poveon_amount),0)::text AS paid_sum
        FROM requests WHERE is_paid_to_poveon = true
        GROUP BY lab_id`,

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

    const paidByLabMap: Record<string, number> = Object.fromEntries(
      paidByLabRaw.map((r) => [r.lab_id, Number(r.paid_sum)])
    );

    const byLab = byLabRaw.map((row) => {
      const totalOwed = Number(row.poveon_sum);
      const totalPaidLab = paidByLabMap[row.lab_id] ?? 0;
      return {
        lab_id: row.lab_id,
        lab_name: labNameMap[row.lab_id] ?? row.lab_id,
        request_count: Number(row.req_count),
        total_poveon_amount: totalOwed,
        total_lab_revenue: Number(row.revenue_sum),
        total_paid: totalPaidLab,
        outstanding: totalOwed - totalPaidLab,
      };
    }).sort((a, b) => b.outstanding - a.outstanding);

    const totalOwed = Number(totalsRaw[0]?.poveon_sum ?? 0);
    const totalPaid = Number(paidTotalRaw[0]?.paid_sum ?? 0);

    // Fetch lab names for recent requests
    const recentLabIds = Array.from(new Set(recentRaw.map((r) => r.lab_id)));
    const recentLabs = await prisma.lab.findMany({ where: { id: { in: recentLabIds } }, select: { id: true, name: true } });
    const recentLabMap = Object.fromEntries(recentLabs.map((l) => [l.id, l.name]));

    return NextResponse.json({
      success: true,
      total_poveon_earned: totalOwed,
      total_lab_revenue: Number(totalsRaw[0]?.revenue_sum ?? 0),
      total_paid: totalPaid,
      total_outstanding: totalOwed - totalPaid,
      by_lab: byLab,
      recent_requests: recentRaw.map((r) => ({
        id: r.id,
        code: r.code,
        lab_id: r.lab_id,
        lab_name: recentLabMap[r.lab_id] ?? r.lab_id,
        patient_name: r.patient_name,
        tests: r.tests,
        poveon_amount: Number(r.poveon_amount),
        lab_revenue_amount: Number(r.lab_revenue_amount),
        is_paid_to_poveon: r.is_paid_to_poveon,
        seen_at: r.seen_at,
      })),
    });
  } catch (error) {
    console.error("[admin/revenue]", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
