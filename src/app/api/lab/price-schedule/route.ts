export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/lab/price-schedule
 * Returns all active catalog tests with their effective price for this lab.
 * Groups by category for the price schedule UI.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.permissions.can_view_wallet) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [tests, overrides] = await Promise.all([
    prisma.catalogTest.findMany({
      where: { is_active: true },
      orderBy: [{ category: { sort_order: "asc" } }, { canonical_name: "asc" }],
      select: {
        id: true,
        canonical_name: true,
        base_price: true,
        is_rapid_test: true,
        category: { select: { name: true, slug: true } },
      },
    }),
    prisma.labTestPrice.findMany({
      where: { lab_id: auth.lab_id },
      select: { catalog_test_id: true, price: true },
    }),
  ]);

  const overrideMap = new Map(overrides.map((o) => [o.catalog_test_id, Number(o.price)]));

  // Group by category
  const grouped: Record<string, { category: string; tests: object[] }> = {};

  for (const t of tests) {
    const cat = t.category.name;
    if (!grouped[cat]) grouped[cat] = { category: cat, tests: [] };
    const effectivePrice = overrideMap.has(t.id) ? overrideMap.get(t.id)! : Number(t.base_price);
    grouped[cat].tests.push({
      id: t.id,
      name: t.canonical_name,
      is_rapid_test: t.is_rapid_test,
      base_price: Number(t.base_price),
      effective_price: effectivePrice,
      is_custom: overrideMap.has(t.id),
    });
  }

  return NextResponse.json({ success: true, schedule: Object.values(grouped) });
}
