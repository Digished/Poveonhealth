export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/catalog/search?q=fbc&lab_id=xxx&limit=8
 *
 * Typeahead search for the doctor form tag input.
 * Returns up to `limit` (default 8) matching catalog tests.
 *
 * Response:
 *  { success: true, results: [{ id, canonical_name, category, effective_price, is_rapid_test }] }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const labId = searchParams.get("lab_id") ?? null;
  const limit = Math.min(20, parseInt(searchParams.get("limit") ?? "8", 10));

  if (q.length < 1) {
    return NextResponse.json({ success: true, results: [] });
  }

  try {
    // Search synonyms for the query string
    const synonymMatches = await prisma.testSynonym.findMany({
      where: {
        synonym: { contains: q, mode: "insensitive" },
        catalog_test: { is_active: true },
      },
      include: {
        catalog_test: {
          include: { category: { select: { name: true } } },
        },
      },
      take: limit * 3, // fetch extra to deduplicate
    });

    // Deduplicate by catalog_test_id, keeping the best match
    const seen = new Map<string, (typeof synonymMatches)[number]>();
    for (const s of synonymMatches) {
      if (!seen.has(s.catalog_test_id)) seen.set(s.catalog_test_id, s);
    }

    const unique = Array.from(seen.values()).slice(0, limit);

    // Fetch lab-specific overrides in one query if labId is provided
    let overrideMap = new Map<string, number>();
    if (labId && unique.length > 0) {
      const ids = unique.map((s) => s.catalog_test_id);
      const overrides = await prisma.labTestPrice.findMany({
        where: { lab_id: labId, catalog_test_id: { in: ids } },
        select: { catalog_test_id: true, price: true },
      });
      overrideMap = new Map(overrides.map((o) => [o.catalog_test_id, Number(o.price)]));
    }

    const results = unique.map((s) => {
      const test = s.catalog_test;
      const effective_price = overrideMap.has(test.id)
        ? overrideMap.get(test.id)!
        : Number(test.base_price);
      return {
        id: test.id,
        canonical_name: test.canonical_name,
        category: test.category.name,
        effective_price,
        is_rapid_test: test.is_rapid_test,
      };
    });

    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error("[catalog/search]", e);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
