export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

interface LabRow {
  lab_id: string;
  lab_name: string;
  total: number;
  arrived: number;
  attended: number;
  paid: number;
  done: number;
  poveon: number;
  qr: number;
  walk_in: number;
  in_queue: number;
}

/**
 * GET /api/admin/clients-stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Platform-wide client tracking for the Poveon admin: arrivals, attendance,
 * payment and source breakdowns — overall and per lab — filterable by the
 * request's created date.
 */
export async function GET(req: NextRequest) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const createdFilter: { gte?: Date; lte?: Date } = {};
    if (from) createdFilter.gte = new Date(from + "T00:00:00");
    if (to) createdFilter.lte = new Date(to + "T23:59:59");

    const [requests, labs] = await Promise.all([
      prisma.request.findMany({
        where: Object.keys(createdFilter).length ? { created_at: createdFilter } : {},
        select: {
          lab_id: true,
          source: true,
          status: true,
          is_paid: true,
          arrived_at: true,
          attended_at: true,
          queue_confirmed_at: true,
        },
      }),
      prisma.lab.findMany({ select: { id: true, name: true } }),
    ]);

    const labName = new Map(labs.map((l) => [l.id, l.name]));
    const byLab = new Map<string, LabRow>();
    const totals = { total: 0, arrived: 0, attended: 0, paid: 0, done: 0, poveon: 0, qr: 0, walk_in: 0, in_queue: 0 };

    for (const r of requests) {
      if (!byLab.has(r.lab_id)) {
        byLab.set(r.lab_id, {
          lab_id: r.lab_id,
          lab_name: labName.get(r.lab_id) ?? "Unknown lab",
          total: 0, arrived: 0, attended: 0, paid: 0, done: 0, poveon: 0, qr: 0, walk_in: 0, in_queue: 0,
        });
      }
      const row = byLab.get(r.lab_id)!;
      const src = (r.source ?? "poveon") as "poveon" | "qr" | "walk_in";
      const arrived = !!r.arrived_at;
      const attended = !!r.attended_at || r.status === "done";
      const inQueue = !!r.queue_confirmed_at && !r.attended_at && r.status !== "done";

      row.total += 1; totals.total += 1;
      if (arrived) { row.arrived += 1; totals.arrived += 1; }
      if (attended) { row.attended += 1; totals.attended += 1; }
      if (r.is_paid) { row.paid += 1; totals.paid += 1; }
      if (r.status === "done") { row.done += 1; totals.done += 1; }
      if (inQueue) { row.in_queue += 1; totals.in_queue += 1; }
      if (src === "poveon") { row.poveon += 1; totals.poveon += 1; }
      else if (src === "qr") { row.qr += 1; totals.qr += 1; }
      else { row.walk_in += 1; totals.walk_in += 1; }
    }

    const perLab = Array.from(byLab.values()).sort((a, b) => b.total - a.total);
    return NextResponse.json({ success: true, totals, labs: perLab });
  } catch (e) {
    console.error("[admin/clients-stats]", e);
    return NextResponse.json({ success: false, error: "Failed to load client stats" }, { status: 500 });
  }
}
