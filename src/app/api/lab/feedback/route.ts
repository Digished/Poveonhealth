import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

const avg = (field: (f: { rating_overall: number; rating_accuracy: number | null; rating_speed: number | null; rating_staff: number | null; rating_environment: number | null }) => number | null | undefined, all: { rating_overall: number; rating_accuracy: number | null; rating_speed: number | null; rating_staff: number | null; rating_environment: number | null }[]) => {
  const vals = all.map(field).filter((v): v is number => v != null);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
};

/** GET /api/lab/feedback — all feedback for the authenticated lab (requires can_view_feedback or isOwner) */
export async function GET(req: NextRequest) {
  try {
    const auth = await getLabAuth(req);
    if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const isOwner = auth.auth_method === "session";
    if (!isOwner && !auth.permissions?.can_view_feedback) {
      return NextResponse.json({ error: "Permission denied." }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit  = Math.min(parseInt(url.searchParams.get("limit")  ?? "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    const [feedbacks, total] = await Promise.all([
      prisma.labFeedback.findMany({
        where: { lab_id: auth.lab_id },
        orderBy: { updated_at: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.labFeedback.count({ where: { lab_id: auth.lab_id } }),
    ]);

    // For aggregates, fetch all (not paged)
    const all = await prisma.labFeedback.findMany({ where: { lab_id: auth.lab_id } });
    const averages = {
      overall:     avg((f) => f.rating_overall, all),
      accuracy:    avg((f) => f.rating_accuracy, all),
      speed:       avg((f) => f.rating_speed, all),
      staff:       avg((f) => f.rating_staff, all),
      environment: avg((f) => f.rating_environment, all),
    };

    return NextResponse.json({ success: true, total, averages, feedbacks });
  } catch (err) {
    console.error("[lab/feedback]", err);
    return NextResponse.json({ error: "Failed to load feedback." }, { status: 500 });
  }
}
