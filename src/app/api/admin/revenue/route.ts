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

    // Aggregate Poveon commission from seen/done requests
    const [totalPoveon, totalLabRevenue, totalPaid, byLabRaw, recentSeen] = await Promise.all([
      // Total Poveon commission earned (all seen requests)
      prisma.request.aggregate({
        _sum: { poveon_amount: true },
        where: { status: { in: ["seen", "done"] } },
      }),
      // Total lab revenue (what labs received for catalog tests)
      prisma.request.aggregate({
        _sum: { lab_revenue_amount: true },
        where: { status: { in: ["seen", "done"] } },
      }),
      // Total already paid to Poveon
      prisma.request.aggregate({
        _sum: { poveon_amount: true },
        where: { is_paid_to_poveon: true },
      }),
      // Per-lab breakdown
      prisma.request.groupBy({
        by: ["lab_id"],
        _sum: { poveon_amount: true, lab_revenue_amount: true },
        _count: { id: true },
        where: { status: { in: ["seen", "done"] }, poveon_amount: { gt: 0 } },
      }),
      // 50 most recently seen requests
      prisma.request.findMany({
        where: { status: { in: ["seen", "done"] }, poveon_amount: { gt: 0 } },
        orderBy: { seen_at: "desc" },
        take: 50,
        select: {
          id: true, code: true, lab_id: true, patient_name: true,
          tests: true, poveon_amount: true, lab_revenue_amount: true,
          is_paid_to_poveon: true, seen_at: true,
          lab: { select: { name: true } },
        },
      }),
    ]);

    // Resolve lab names for by_lab breakdown
    const labIds = byLabRaw.map((r) => r.lab_id);
    const labs = await prisma.lab.findMany({ where: { id: { in: labIds } }, select: { id: true, name: true } });
    const labNameMap = Object.fromEntries(labs.map((l) => [l.id, l.name]));

    // Per-lab: total owed, total paid
    const paidByLab = await prisma.request.groupBy({
      by: ["lab_id"],
      _sum: { poveon_amount: true },
      where: { is_paid_to_poveon: true, lab_id: { in: labIds } },
    });
    const paidByLabMap: Record<string, number> = Object.fromEntries(
      paidByLab.map((r) => [r.lab_id, Number(r._sum.poveon_amount ?? 0)])
    );

    const byLab = byLabRaw.map((row) => {
      const totalOwed = Number(row._sum.poveon_amount ?? 0);
      const totalPaidLab = paidByLabMap[row.lab_id] ?? 0;
      return {
        lab_id: row.lab_id,
        lab_name: labNameMap[row.lab_id] ?? row.lab_id,
        request_count: row._count.id,
        total_poveon_amount: totalOwed,
        total_lab_revenue: Number(row._sum.lab_revenue_amount ?? 0),
        total_paid: totalPaidLab,
        outstanding: totalOwed - totalPaidLab,
      };
    }).sort((a, b) => b.outstanding - a.outstanding);

    const totalOwed = Number(totalPoveon._sum.poveon_amount ?? 0);
    const totalPaidAmt = Number(totalPaid._sum.poveon_amount ?? 0);

    return NextResponse.json({
      success: true,
      total_poveon_earned: totalOwed,
      total_lab_revenue: Number(totalLabRevenue._sum.lab_revenue_amount ?? 0),
      total_paid: totalPaidAmt,
      total_outstanding: totalOwed - totalPaidAmt,
      by_lab: byLab,
      recent_requests: recentSeen.map((r) => ({
        id: r.id,
        code: r.code,
        lab_id: r.lab_id,
        lab_name: r.lab?.name ?? r.lab_id,
        patient_name: r.patient_name,
        tests: r.tests,
        poveon_amount: Number(r.poveon_amount ?? 0),
        lab_revenue_amount: Number(r.lab_revenue_amount ?? 0),
        is_paid_to_poveon: r.is_paid_to_poveon,
        seen_at: r.seen_at,
      })),
    });
  } catch (error) {
    console.error("[admin/revenue]", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
