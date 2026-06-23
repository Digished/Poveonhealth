export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMarketerFromRequest } from "@/lib/marketer-auth";
import { getMarketerNetwork, buildGoalStats } from "@/lib/marketer/insights";

/** GET /api/scale/goals — weekly target + progress + streak */
export async function GET(req: NextRequest) {
  try {
    const marketer = await getMarketerFromRequest(req);
    if (!marketer) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const network = await getMarketerNetwork(marketer.id);
    const stats = buildGoalStats(network);
    return NextResponse.json({
      success: true,
      weekly_target: marketer.weekly_target,
      total_doctors: network.length,
      ...stats,
    });
  } catch (err) {
    console.error("[scale/goals GET]", err);
    return NextResponse.json({ error: "Failed to load goals" }, { status: 500 });
  }
}

/** PATCH /api/scale/goals — set the weekly activation target */
export async function PATCH(req: NextRequest) {
  try {
    const marketer = await getMarketerFromRequest(req);
    if (!marketer) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { weekly_target } = await req.json();
    const value = weekly_target == null || weekly_target === ""
      ? null
      : Math.max(1, Math.min(500, parseInt(weekly_target, 10) || 0));

    await prisma.marketer.update({ where: { id: marketer.id }, data: { weekly_target: value } });
    return NextResponse.json({ success: true, weekly_target: value });
  } catch (err) {
    console.error("[scale/goals PATCH]", err);
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  }
}
