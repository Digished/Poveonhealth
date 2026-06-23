export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getMarketerFromRequest } from "@/lib/marketer-auth";
import { getMarketerNetwork, buildProof } from "@/lib/marketer/insights";

/** GET /api/scale/proof?doctor_email= — impact card for one doctor */
export async function GET(req: NextRequest) {
  try {
    const marketer = await getMarketerFromRequest(req);
    if (!marketer) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const email = (new URL(req.url).searchParams.get("doctor_email") ?? "").trim();
    if (!email) return NextResponse.json({ error: "doctor_email required" }, { status: 400 });

    const network = await getMarketerNetwork(marketer.id);
    const proof = buildProof(network, email);
    if (!proof) return NextResponse.json({ error: "Doctor not in your network" }, { status: 404 });

    return NextResponse.json({ success: true, proof });
  } catch (err) {
    console.error("[scale/proof]", err);
    return NextResponse.json({ error: "Failed to build proof" }, { status: 500 });
  }
}
