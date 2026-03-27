export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/catalog/search?q=fbc&lab_id=xxx&limit=8
 *
 * Typeahead search against a lab's own offered tests (lab_offered_tests).
 * Searches raw_name and synonyms JSON array.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const labId = searchParams.get("lab_id") ?? null;
  const limit = Math.min(20, parseInt(searchParams.get("limit") ?? "8", 10));

  if (q.length < 1) return NextResponse.json({ success: true, results: [] });

  try {
    const where = {
      is_active: true,
      ...(labId ? { lab_id: labId } : {}),
      raw_name: { contains: q, mode: "insensitive" as const },
    };

    const tests = await prisma.labOfferedTest.findMany({
      where,
      take: limit * 3,
      select: {
        id: true,
        raw_name: true,
        category_label: true,
        lab_price: true,
        synonyms: true,
      },
    });

    // Also search synonyms for tests not matched by raw_name
    const allTests = labId
      ? await prisma.labOfferedTest.findMany({
          where: { is_active: true, lab_id: labId },
          select: { id: true, raw_name: true, category_label: true, lab_price: true, synonyms: true },
        })
      : [];

    const synonymMatches = allTests.filter((t) => {
      if (tests.find((r) => r.id === t.id)) return false; // already in results
      const syns = Array.isArray(t.synonyms) ? (t.synonyms as string[]) : [];
      return syns.some((s) => s.toLowerCase().includes(q.toLowerCase()));
    });

    const merged = [...tests, ...synonymMatches];

    // Rank: exact → starts-with → substring
    const ql = q.toLowerCase();
    const ranked = merged.sort((a, b) => {
      const score = (t: typeof a) => {
        const n = t.raw_name.toLowerCase();
        if (n === ql) return 0;
        if (n.startsWith(ql)) return 1;
        return 2;
      };
      return score(a) - score(b);
    }).slice(0, limit);

    const results = ranked.map((t) => ({
      id: t.id,
      canonical_name: t.raw_name,
      category: t.category_label ?? "Lab Test",
      effective_price: Number(t.lab_price),
      is_rapid_test: false,
    }));

    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error("[catalog/search]", e);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
