export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/team/activity
 * Per-team-member activity summary so the lab can gauge efficiency: actions
 * in the last 7 / 30 days, last-active time and the most recent actions for
 * each actor. Gated by can_manage_team or can_manage_roles (owners included).
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_team && !auth.permissions.can_manage_roles) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activities = await prisma.labActivity.findMany({
    where: { lab_id: auth.lab_id, created_at: { gte: since } },
    orderBy: { created_at: "desc" },
    take: 2000,
    select: { actor_email: true, action: true, detail: true, created_at: true },
  });

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const byActor = new Map<string, {
    actor_email: string;
    actions_7d: number;
    actions_30d: number;
    last_active: string | null;
    recent: { action: string; detail: string | null; created_at: Date }[];
  }>();

  for (const a of activities) {
    const key = (a.actor_email ?? "unknown").toLowerCase();
    if (!byActor.has(key)) {
      byActor.set(key, { actor_email: key, actions_7d: 0, actions_30d: 0, last_active: null, recent: [] });
    }
    const s = byActor.get(key)!;
    s.actions_30d += 1;
    if (a.created_at.getTime() > weekAgo) s.actions_7d += 1;
    if (!s.last_active) s.last_active = a.created_at.toISOString(); // list is newest-first
    if (s.recent.length < 5) s.recent.push({ action: a.action, detail: a.detail, created_at: a.created_at });
  }

  return NextResponse.json({ success: true, stats: Array.from(byActor.values()) });
}
