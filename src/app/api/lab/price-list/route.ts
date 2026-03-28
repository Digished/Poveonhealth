export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/lab/price-list
 * Returns all offered tests (active + inactive) for the lab, each decorated
 * with the most-recent price-change entry so the UI can show ↑/↓ indicators.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tests, recentChanges] = await Promise.all([
    prisma.labOfferedTest.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: [{ category_label: "asc" }, { raw_name: "asc" }],
      select: {
        id: true,
        raw_name: true,
        category_label: true,
        lab_price: true,
        poveon_fee: true,
        commission_pct: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    }),
    // Get the single most-recent change per test (using a subquery approach)
    prisma.priceChangeLog.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: { changed_at: "desc" },
      select: {
        lab_offered_test_id: true,
        changed_by_email: true,
        changed_by_role: true,
        field_changed: true,
        old_price: true,
        new_price: true,
        old_value: true,
        new_value: true,
        changed_at: true,
      },
    }),
  ]);

  // Build a map: testId → most-recent change entry
  const changeMap = new Map<string, (typeof recentChanges)[0]>();
  for (const c of recentChanges) {
    if (!changeMap.has(c.lab_offered_test_id)) {
      changeMap.set(c.lab_offered_test_id, c);
    }
  }

  const enriched = tests.map((t) => {
    const change = changeMap.get(t.id);
    let priceDirection: "up" | "down" | "same" | null = null;
    if (change?.field_changed === "lab_price" && change.old_price != null && change.new_price != null) {
      const oldP = Number(change.old_price);
      const newP = Number(change.new_price);
      priceDirection = newP > oldP ? "up" : newP < oldP ? "down" : "same";
    }
    return {
      id: t.id,
      raw_name: t.raw_name,
      category_label: t.category_label,
      lab_price: Number(t.lab_price),
      poveon_fee: t.poveon_fee ? Number(t.poveon_fee) : null,
      commission_pct: t.commission_pct ? Number(t.commission_pct) : null,
      is_active: t.is_active,
      created_at: t.created_at.toISOString(),
      updated_at: t.updated_at.toISOString(),
      recent_change: change
        ? {
            field_changed: change.field_changed,
            old_price: change.old_price ? Number(change.old_price) : null,
            new_price: change.new_price ? Number(change.new_price) : null,
            old_value: change.old_value,
            new_value: change.new_value,
            changed_by: change.changed_by_email,
            changed_by_role: change.changed_by_role,
            changed_at: change.changed_at.toISOString(),
            direction: priceDirection,
          }
        : null,
    };
  });

  // Unique categories for filter dropdowns
  const categories = Array.from(new Set(tests.map((t) => t.category_label).filter(Boolean))).sort() as string[];

  return NextResponse.json({ success: true, tests: enriched, categories });
}
