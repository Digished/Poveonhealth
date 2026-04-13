import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Cache catalog search results for 5 minutes (CDN + browser)
export const revalidate = 300;

/**
 * GET /api/catalog/search?q=fbc&lab_id=xxx&limit=8
 *
 * Typeahead search against a lab's own offered tests (lab_offered_tests).
 * Searches raw_name with ILIKE and synonyms via a single Postgres raw query
 * so we avoid a full-table scan on every keystroke.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const labId = searchParams.get("lab_id") ?? null;
  const limit = Math.min(20, parseInt(searchParams.get("limit") ?? "8", 10));

  if (q.length < 1) {
    return NextResponse.json({ success: true, results: [] }, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  }

  try {
    const pattern = `%${q}%`;

    // Single query: search raw_name + synonyms JSON array via Postgres
    // This avoids the N+1 full-table scan of the old synonym approach
    type Row = {
      id: string;
      raw_name: string;
      category_label: string | null;
      lab_price: string | null;
    };

    const rows: Row[] = await prisma.$queryRaw`
      SELECT id, raw_name, category_label, lab_price::text
      FROM "LabOfferedTest"
      WHERE is_active = true
        AND (${labId}::text IS NULL OR lab_id = ${labId})
        AND (
          raw_name ILIKE ${pattern}
          OR (
            synonyms IS NOT NULL
            AND jsonb_typeof(synonyms::jsonb) = 'array'
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(synonyms::jsonb) s
              WHERE s ILIKE ${pattern}
            )
          )
        )
      ORDER BY
        CASE
          WHEN lower(raw_name) = lower(${q})              THEN 0
          WHEN lower(raw_name) LIKE lower(${q}) || '%'    THEN 1
          ELSE 2
        END
      LIMIT ${limit}
    `;

    const results = rows.map((t) => ({
      id: t.id,
      canonical_name: t.raw_name,
      category: t.category_label ?? "Lab Test",
      effective_price: t.lab_price ? Number(t.lab_price) : 0,
      is_rapid_test: false,
    }));

    return NextResponse.json({ success: true, results }, {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    console.error("[catalog/search]", e);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
