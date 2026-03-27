export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/lab/poveon
 *
 * Returns the lab's Poveon commission summary:
 * - total_owed: cumulative Poveon commission across all seen/done requests
 * - total_paid: amount already paid to Poveon
 * - outstanding: total_owed - total_paid
 * - requests: recent requests with a non-zero poveon_amount, newest first
 *
 * TODO: Paystack payment integration — labs will pay outstanding balance here.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [totals, paidTotals, requests] = await Promise.all([
    prisma.request.aggregate({
      _sum: { poveon_amount: true, lab_revenue_amount: true },
      where: { lab_id: auth.lab_id, status: { in: ["seen", "done"] } },
    }),
    prisma.request.aggregate({
      _sum: { poveon_amount: true },
      where: { lab_id: auth.lab_id, is_paid_to_poveon: true },
    }),
    prisma.request.findMany({
      where: {
        lab_id: auth.lab_id,
        status: { in: ["seen", "done"] },
        poveon_amount: { gt: 0 },
      },
      orderBy: { seen_at: "desc" },
      take: 100,
      select: {
        id: true,
        code: true,
        patient_name: true,
        tests: true,
        poveon_amount: true,
        lab_revenue_amount: true,
        is_paid_to_poveon: true,
        seen_at: true,
        completed_at: true,
      },
    }),
  ]);

  const totalOwed = Number(totals._sum.poveon_amount ?? 0);
  const totalPaid = Number(paidTotals._sum.poveon_amount ?? 0);

  return NextResponse.json({
    success: true,
    total_owed: totalOwed,
    total_lab_revenue: Number(totals._sum.lab_revenue_amount ?? 0),
    total_paid: totalPaid,
    outstanding: totalOwed - totalPaid,
    requests: requests.map((r) => ({
      id: r.id,
      code: r.code,
      patient_name: r.patient_name,
      tests: r.tests,
      poveon_amount: Number(r.poveon_amount ?? 0),
      lab_revenue_amount: Number(r.lab_revenue_amount ?? 0),
      is_paid_to_poveon: r.is_paid_to_poveon,
      seen_at: r.seen_at,
      completed_at: r.completed_at,
    })),
  });
}
