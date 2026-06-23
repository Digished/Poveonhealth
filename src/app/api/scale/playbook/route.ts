export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getMarketerFromRequest } from "@/lib/marketer-auth";
import { getMarketerNetwork, buildPlaybook } from "@/lib/marketer/insights";

/** GET /api/scale/playbook — today's prioritized call list */
export async function GET(req: NextRequest) {
  try {
    const marketer = await getMarketerFromRequest(req);
    if (!marketer) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const network = await getMarketerNetwork(marketer.id);
    const playbook = buildPlaybook(network);
    const counts = {
      activate: playbook.activate.length,
      winback: playbook.winback.length,
      thank_expand: playbook.thank_expand.length,
      nudge: playbook.nudge.length,
    };
    return NextResponse.json({ success: true, marketer_name: marketer.name, playbook, counts });
  } catch (err) {
    console.error("[scale/playbook]", err);
    return NextResponse.json({ error: "Failed to build playbook" }, { status: 500 });
  }
}
