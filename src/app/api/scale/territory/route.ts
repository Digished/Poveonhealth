export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getMarketerFromRequest } from "@/lib/marketer-auth";
import { getMarketerNetwork, buildTerritory } from "@/lib/marketer/insights";

/** GET /api/scale/territory — doctors grouped by hospital for visit planning */
export async function GET(req: NextRequest) {
  try {
    const marketer = await getMarketerFromRequest(req);
    if (!marketer) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const network = await getMarketerNetwork(marketer.id);
    const territory = buildTerritory(network);
    return NextResponse.json({ success: true, territory });
  } catch (err) {
    console.error("[scale/territory]", err);
    return NextResponse.json({ error: "Failed to build territory" }, { status: 500 });
  }
}
