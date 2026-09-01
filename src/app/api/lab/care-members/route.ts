export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { labRoster } from "@/lib/care-network";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/lab/care-members — the care-plan members who chose this lab, and
 * the tests their doctors have scheduled.
 *
 * Driven by the member's current preference, so someone who switches labs
 * leaves this list immediately.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const auth = await getLabAuth(req);
    if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const members = await labRoster(auth.lab_id);
    const pending = members.reduce((sum, m) => sum + m.test_orders.length, 0);

    return NextResponse.json({
      success: true,
      summary: { members: members.length, pending_tests: pending },
      members,
    });
  } catch (err) {
    console.error("[lab/care-members]", err);
    return NextResponse.json({ error: "Could not load your care-plan members." }, { status: 500 });
  }
}
