export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/catalog/search?q=fbc&lab_id=xxx&limit=8
 *
 * Typeahead search for the doctor form tag input.
 * Searches both testSynonym entries AND canonical_name directly so tests are
 * found even when a matching synonym hasn't been added to the database yet.
 * Results are ranked: exact match → prefix match → substring match.
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
    // Search synonyms AND canonical names in parallel
    const [synonymMatches, canonicalMatches] = await Promise.all([
      prisma.testSynonym.findMany({
        where: {
          synonym: { contains: q, mode: "insensitive" },
          catalog_test: { is_active: true },
        },
        include: {
          catalog_test: { include: { category: { select: { name: true } } } },
        },
        take: limit * 4,
      }),
      prisma.catalogTest.findMany({
        where: {
          is_active: true,
          canonical_name: { contains: q, mode: "insensitive" },
        },
        include: { category: { select: { name: true } } },
        take: limit * 2,
      }),
    ]);

    // Merge: synonym matches first, then canonical-name-only matches
    const seen = new Map<string, { id: string; canonical_name: string; category: { name: string }; base_price: number; is_rapid_test: boolean; _synonymMatch: string }>();

    for (const s of synonymMatches) {
      if (!seen.has(s.catalog_test_id)) {
        seen.set(s.catalog_test_id, {
          id: s.catalog_test.id,
          canonical_name: s.catalog_test.canonical_name,
          category: s.catalog_test.category,
          base_price: Number(s.catalog_test.base_price),
          is_rapid_test: s.catalog_test.is_rapid_test,
          _synonymMatch: s.synonym,
        });
      }
    }
    for (const t of canonicalMatches) {
      if (!seen.has(t.id)) {
        seen.set(t.id, {
          id: t.id,
          canonical_name: t.canonical_name,
          category: t.category,
          base_price: Number(t.base_price),
          is_rapid_test: t.is_rapid_test,
          _synonymMatch: t.canonical_name,
        });
      }
    }

    // Rank by match quality: exact → starts-with → substring
    const ql = q.toLowerCase();
    const ranked = Array.from(seen.values()).sort((a, b) => {
      const scoreOf = (entry: typeof a) => {
        const name = entry.canonical_name.toLowerCase();
        const syn = entry._synonymMatch.toLowerCase();
        if (name === ql || syn === ql) return 0;
        if (name.startsWith(ql) || syn.startsWith(ql)) return 1;
        return 2;
      };
      return scoreOf(a) - scoreOf(b);
    }).slice(0, limit);

    // Fetch lab-specific price overrides
    let overrideMap = new Map<string, number>();
    if (labId && ranked.length > 0) {
      const ids = ranked.map((t) => t.id);
      const overrides = await prisma.labTestPrice.findMany({
        where: { lab_id: labId, catalog_test_id: { in: ids } },
        select: { catalog_test_id: true, price: true },
      });
      overrideMap = new Map(overrides.map((o) => [o.catalog_test_id, Number(o.price)]));
    }

    const results = ranked.map((t) => ({
      id: t.id,
      canonical_name: t.canonical_name,
      category: t.category.name,
      effective_price: overrideMap.has(t.id) ? overrideMap.get(t.id)! : t.base_price,
      is_rapid_test: t.is_rapid_test,
    }));

    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error("[catalog/search]", e);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
