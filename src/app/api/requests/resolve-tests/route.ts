export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { resolveTests, totalFromBreakdown } from "@/lib/resolve-tests";

/**
 * POST /api/requests/resolve-tests
 *
 * Body: { tests: string, lab_id?: string }
 *
 * Returns the resolution breakdown and total quoted price.
 * Used server-side at request creation and by the doctor form preview.
 */
export async function POST(request: NextRequest) {
  try {
    const { tests, lab_id } = await request.json() as { tests?: string; lab_id?: string };

    if (!tests || typeof tests !== "string" || !tests.trim()) {
      return NextResponse.json({ success: false, error: "tests string is required" }, { status: 400 });
    }

    const breakdown = await resolveTests(tests, lab_id ?? null);
    const total = totalFromBreakdown(breakdown);

    return NextResponse.json({ success: true, breakdown, total });
  } catch (e) {
    console.error("[resolve-tests]", e);
    return NextResponse.json({ success: false, error: "Resolution failed" }, { status: 500 });
  }
}
