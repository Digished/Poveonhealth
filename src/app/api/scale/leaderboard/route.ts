export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMarketerFromRequest } from "@/lib/marketer-auth";

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "Marketer";
  const initial = parts[1]?.[0] ? ` ${parts[1][0]}.` : "";
  return `${first}${initial}`;
}

/** GET /api/scale/leaderboard — rank marketers by this month's attributed revenue */
export async function GET(req: NextRequest) {
  try {
    const me = await getMarketerFromRequest(req);
    if (!me) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [marketers, links] = await Promise.all([
      prisma.marketer.findMany({ where: { suspended: false }, select: { id: true, name: true } }),
      prisma.doctorMarketerLink.findMany({ select: { marketer_id: true, doctor_email: true } }),
    ]);

    const emailToMarketer = new Map<string, string>();
    for (const l of links) emailToMarketer.set(l.doctor_email, l.marketer_id);

    const emails = Array.from(emailToMarketer.keys());
    const requests = emails.length
      ? await prisma.request.findMany({
          where: {
            doctor_email: { in: emails },
            status: { in: ["seen", "done"] },
            created_at: { gte: monthStart },
          },
          select: { doctor_email: true, lab_revenue_amount: true },
        })
      : [];

    const revenue = new Map<string, number>();
    const activeDoctors = new Map<string, Set<string>>();
    for (const r of requests) {
      const mid = emailToMarketer.get(r.doctor_email!);
      if (!mid) continue;
      revenue.set(mid, (revenue.get(mid) ?? 0) + (r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0));
      const set = activeDoctors.get(mid) ?? new Set<string>();
      set.add(r.doctor_email!);
      activeDoctors.set(mid, set);
    }

    const ranked = marketers
      .map((m) => ({
        id: m.id,
        name: m.name,
        revenue: revenue.get(m.id) ?? 0,
        active_doctors: activeDoctors.get(m.id)?.size ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue || b.active_doctors - a.active_doctors);

    const myIndex = ranked.findIndex((r) => r.id === me.id);
    const top = ranked.slice(0, 10).map((r, i) => ({
      rank: i + 1,
      name: r.id === me.id ? `${r.name} (you)` : maskName(r.name),
      is_me: r.id === me.id,
      revenue: r.revenue,
      active_doctors: r.active_doctors,
    }));

    return NextResponse.json({
      success: true,
      total: ranked.length,
      my_rank: myIndex >= 0 ? myIndex + 1 : null,
      my_revenue: myIndex >= 0 ? ranked[myIndex].revenue : 0,
      top,
    });
  } catch (err) {
    console.error("[scale/leaderboard]", err);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}
