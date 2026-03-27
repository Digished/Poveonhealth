export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/lab/price-schedule
 * Returns all active offered tests for this lab, grouped by category.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tests = await prisma.labOfferedTest.findMany({
    where: { lab_id: auth.lab_id, is_active: true },
    orderBy: [{ category_label: "asc" }, { raw_name: "asc" }],
    select: {
      id: true,
      raw_name: true,
      category_label: true,
      lab_price: true,
      poveon_fee: true,
      commission_pct: true,
    },
  });

  const grouped: Record<string, { category: string; tests: object[] }> = {};
  for (const t of tests) {
    const cat = t.category_label ?? "Uncategorized";
    if (!grouped[cat]) grouped[cat] = { category: cat, tests: [] };
    grouped[cat].tests.push({
      id: t.id,
      name: t.raw_name,
      lab_price: Number(t.lab_price),
      poveon_fee: t.poveon_fee ? Number(t.poveon_fee) : null,
      commission_pct: t.commission_pct ? Number(t.commission_pct) : null,
    });
  }

  return NextResponse.json({ success: true, schedule: Object.values(grouped) });
}
