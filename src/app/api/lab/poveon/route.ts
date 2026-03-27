export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [totalsRaw, paidRaw, requestsRaw] = await Promise.all([
    prisma.$queryRaw<[{ poveon_sum: string; revenue_sum: string }]>`
      SELECT COALESCE(SUM(poveon_amount),0)::text AS poveon_sum,
             COALESCE(SUM(lab_revenue_amount),0)::text AS revenue_sum
      FROM requests
      WHERE lab_id = ${auth.lab_id} AND status IN ('seen','done')`,

    prisma.$queryRaw<[{ paid_sum: string }]>`
      SELECT COALESCE(SUM(poveon_amount),0)::text AS paid_sum
      FROM requests
      WHERE lab_id = ${auth.lab_id} AND is_paid_to_poveon = true`,

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
  ]);

  const totalOwed = Number(totalsRaw[0]?.poveon_sum ?? 0);
  const totalPaid = Number(paidRaw[0]?.paid_sum ?? 0);

  return NextResponse.json({
    success: true,
    total_owed: totalOwed,
    total_lab_revenue: Number(totalsRaw[0]?.revenue_sum ?? 0),
    total_paid: totalPaid,
    outstanding: totalOwed - totalPaid,
    requests: requestsRaw.map((r) => ({
      id: r.id,
      code: r.code,
      patient_name: r.patient_name,
      tests: r.tests,
      poveon_amount: Number(r.poveon_amount),
      lab_revenue_amount: Number(r.lab_revenue_amount),
      is_paid_to_poveon: r.is_paid_to_poveon,
      seen_at: r.seen_at,
      completed_at: r.completed_at,
      test_breakdown: Array.isArray(r.test_breakdown) ? r.test_breakdown : [],
    })),
  });
}
