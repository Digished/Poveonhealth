export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getPharmacyFromRequest } from "@/lib/consult";
import { pharmacyRoster } from "@/lib/care-network";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/pharmacy/care-members — the care-plan members who chose this
 * pharmacy, and the medication scheduled for them.
 *
 * The point is planning: a pharmacy can see what its regulars are due to
 * collect and stock accordingly. A member who switches pharmacy disappears
 * from this list at once — the query is driven by the current preference, so
 * there is no copy of them left behind.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const members = await pharmacyRoster(pharmacy.id);
    const pending = members.reduce((sum, m) => sum + m.prescriptions.length, 0);

    return NextResponse.json({
      success: true,
      summary: { members: members.length, pending_prescriptions: pending },
      members,
    });
  } catch (err) {
    console.error("[pharmacy/care-members]", err);
    return NextResponse.json({ error: "Could not load your care-plan members." }, { status: 500 });
  }
}
