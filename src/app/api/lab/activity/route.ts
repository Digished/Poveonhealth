export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    if (!auth.permissions.can_view_activity) {
      return NextResponse.json({ success: false, error: "Your role does not permit viewing activity logs" }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 200);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    const [activities, total] = await Promise.all([
      prisma.labActivity.findMany({
        where: { lab_id: auth.lab_id },
        orderBy: { created_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.labActivity.count({ where: { lab_id: auth.lab_id } }),
    ]);

    return NextResponse.json({ success: true, activities, total });
  } catch (err) {
    console.error("[lab/activity]", err);
    return NextResponse.json({ success: false, error: "Failed to load activity" }, { status: 500 });
  }
}
