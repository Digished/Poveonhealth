import { NextRequest, NextResponse } from "next/server";
import { detectTests } from "@/lib/test-dictionary";
import { getSegmentIndex } from "@/lib/test-segment-cache";

export const runtime = "nodejs";

/**
 * POST /api/requests/segment-tests  { text, labId? }
 *
 * Fast, LLM-free separation of the tests in a doctor's free-typed Fast Mode
 * input — works even with no commas ("fbc mp widal" → 3 tests). Matches against
 * the lab's own catalogue plus a built-in abbreviation dictionary and returns
 * the detected tests (as chips) and the leftover non-test text.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text : "";
    const labId = typeof body.labId === "string" && body.labId ? body.labId : null;

    if (text.trim().length < 2) {
      return NextResponse.json({ success: true, tests: [], remainder: "" });
    }

    const index = await getSegmentIndex(labId);
    const { tests, remainder } = detectTests(text, index);
    return NextResponse.json({ success: true, tests, remainder });
  } catch (e) {
    console.error("[segment-tests]", e);
    return NextResponse.json({ success: false, tests: [], remainder: "" }, { status: 500 });
  }
}
