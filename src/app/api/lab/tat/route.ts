export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/tat
 * Turnaround-time analytics for completed requests: overall avg/median TAT
 * (registration → reported), TAT by test, and SLA-breach detection against
 * each test's tat_hours target.
 */
const HOUR = 1000 * 60 * 60;

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type Breakdown = { raw?: string; canonical_name?: string }[];

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_analytics) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Per-test SLA targets (hours) from the lab's catalog.
  const offered = await prisma.labOfferedTest.findMany({
    where: { lab_id: auth.lab_id, tat_hours: { not: null } },
    select: { raw_name: true, tat_hours: true },
  });
  const tatByName = new Map<string, number>();
  for (const o of offered) if (o.tat_hours != null) tatByName.set(o.raw_name.toLowerCase().trim(), o.tat_hours);

  const done = await prisma.request.findMany({
    where: { lab_id: auth.lab_id, status: "done", completed_at: { not: null } },
    orderBy: { completed_at: "desc" },
    take: 300,
    select: { id: true, code: true, tests: true, test_breakdown: true, created_at: true, completed_at: true },
  });

  const tatHours: number[] = [];
  const perTest = new Map<string, { total: number; count: number }>();
  const breaches: { code: string; hours: number; target: number }[] = [];

  for (const r of done) {
    if (!r.completed_at) continue;
    const hours = (r.completed_at.getTime() - r.created_at.getTime()) / HOUR;
    if (hours < 0) continue;
    tatHours.push(hours);

    // Collect test names from breakdown (preferred) or the raw tests string.
    const names: string[] = [];
    const bd = r.test_breakdown as Breakdown | null;
    if (Array.isArray(bd)) for (const item of bd) { const n = (item.canonical_name || item.raw || "").trim(); if (n) names.push(n); }
    if (names.length === 0 && r.tests) for (const n of r.tests.split(/[,\n]/)) { const t = n.trim(); if (t) names.push(t); }

    let target = Infinity;
    for (const n of names) {
      const acc = perTest.get(n) ?? { total: 0, count: 0 };
      acc.total += hours; acc.count += 1; perTest.set(n, acc);
      const t = tatByName.get(n.toLowerCase().trim());
      if (t != null) target = Math.min(target, t);
    }
    if (target !== Infinity && hours > target) breaches.push({ code: r.code, hours: Math.round(hours * 10) / 10, target });
  }

  const byTest = Array.from(perTest.entries())
    .map(([name, v]) => ({ name, avg_hours: Math.round((v.total / v.count) * 10) / 10, count: v.count }))
    .sort((a, b) => b.avg_hours - a.avg_hours)
    .slice(0, 10);

  return NextResponse.json({
    summary: {
      completed: tatHours.length,
      avg_hours: tatHours.length ? Math.round((tatHours.reduce((a, b) => a + b, 0) / tatHours.length) * 10) / 10 : 0,
      median_hours: Math.round(median(tatHours) * 10) / 10,
      sla_breaches: breaches.length,
      sla_tracked: tatByName.size,
    },
    by_test: byTest,
    breaches: breaches.slice(0, 25),
  });
}
