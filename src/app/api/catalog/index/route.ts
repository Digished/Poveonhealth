import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { makeEtag, notModified } from "@/lib/http-cache";

// A lab's catalogue changes rarely; the CDN can serve this to everyone.
export const revalidate = 300;

/** Above this, the payload stops being worth shipping and we fall back to server search. */
const MAX_TESTS = 4000;

/**
 * GET /api/catalog/index?lab_id=…
 *
 * The whole catalogue for one lab, in the most compact shape that still
 * supports search: rows of [id, name, category, price, synonyms]. The client
 * fetches this once and then filters in memory, so typing a test name costs no
 * network round trip at all — the previous per-keystroke query ran an
 * un-indexable ILIKE '%…%' plus a JSON expansion on every letter.
 */
export async function GET(request: NextRequest) {
  const labId = new URL(request.url).searchParams.get("lab_id");
  if (!labId) return NextResponse.json({ success: false, error: "lab_id required" }, { status: 400 });

  try {
    const [count, newest] = await Promise.all([
      prisma.labOfferedTest.count({ where: { lab_id: labId, is_active: true } }),
      prisma.labOfferedTest.aggregate({ where: { lab_id: labId, is_active: true }, _max: { updated_at: true } }),
    ]);

    const etag = makeEtag(["catalog-index", labId, count, newest._max.updated_at]);
    const cached = notModified(request, etag);
    if (cached) return cached;

    if (count > MAX_TESTS) {
      return NextResponse.json(
        { success: true, truncated: true, count, tests: [] },
        { headers: { ETag: etag, "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400" } }
      );
    }

    const rows = await prisma.labOfferedTest.findMany({
      where: { lab_id: labId, is_active: true },
      orderBy: { raw_name: "asc" },
      select: { id: true, raw_name: true, category_label: true, lab_price: true, synonyms: true },
    });

    type Row = (typeof rows)[number];
    const tests = rows.map((t: Row) => {
      // Synonyms travel as one lowercase, pipe-joined string — matched against,
      // never displayed, and far smaller than a nested array per row.
      const syns = Array.isArray(t.synonyms)
        ? (t.synonyms as unknown[]).map((s) => String(s).toLowerCase().trim()).filter(Boolean).join("|")
        : "";
      return [
        t.id,
        t.raw_name,
        t.category_label ?? "",
        t.lab_price ? Number(t.lab_price) : 0,
        syns,
      ];
    });

    return NextResponse.json(
      { success: true, count, tests },
      {
        headers: {
          ETag: etag,
          // Public and cacheable: one database read serves every clinician
          // filling a form for this lab.
          "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
        },
      }
    );
  } catch (e) {
    console.error("[catalog/index]", e);
    return NextResponse.json({ success: false, error: "Failed to load catalogue" }, { status: 500 });
  }
}
