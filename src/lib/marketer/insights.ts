import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

export interface NetworkRequest {
  id: string;
  code: string;
  status: string; // incoming | seen | done
  tests: string;
  created_at: Date;
  seen_at: Date | null;
  completed_at: Date | null;
  revenue: number;
}

export interface NetworkDoctor {
  email: string;
  name: string;
  phone: string | null;
  hospitals: string[];
  claimed: boolean;
  linked_at: Date;
  requests: NetworkRequest[];
  total: number;
  done: number;
  incoming: number;
  revenue: number;
  first_request_at: Date | null;
  last_request_at: Date | null;
}

const isRevenue = (s: string) => s === "seen" || s === "done";

/** Build the marketer's network: every linked doctor with their requests + metrics. */
export async function getMarketerNetwork(marketerId: string): Promise<NetworkDoctor[]> {
  const links = await prisma.doctorMarketerLink.findMany({
    where: { marketer_id: marketerId },
    orderBy: { created_at: "asc" },
  });
  if (links.length === 0) return [];

  const emails = links.map((l) => l.doctor_email);

  const [profiles, requests] = await Promise.all([
    prisma.doctorProfile.findMany({ where: { email: { in: emails } } }),
    prisma.request.findMany({
      where: { doctor_email: { in: emails } },
      select: {
        id: true, code: true, status: true, tests: true, created_at: true,
        seen_at: true, completed_at: true, lab_revenue_amount: true,
        doctor_name: true, doctor_email: true,
      },
      orderBy: { created_at: "desc" },
    }),
  ]);

  const profileByEmail = new Map(profiles.map((p) => [p.email, p]));
  const reqsByEmail = new Map<string, NetworkRequest[]>();
  for (const r of requests) {
    const email = r.doctor_email!;
    const list = reqsByEmail.get(email) ?? [];
    list.push({
      id: r.id,
      code: r.code,
      status: r.status,
      tests: r.tests ?? "",
      created_at: r.created_at,
      seen_at: r.seen_at,
      completed_at: r.completed_at,
      revenue: isRevenue(r.status) && r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0,
    });
    reqsByEmail.set(email, list);
  }

  const nameByEmail = new Map<string, string>();
  for (const r of requests) {
    if (r.doctor_email && r.doctor_name && !nameByEmail.has(r.doctor_email)) {
      nameByEmail.set(r.doctor_email, r.doctor_name);
    }
  }

  return links.map((link): NetworkDoctor => {
    const profile = profileByEmail.get(link.doctor_email);
    const reqs = reqsByEmail.get(link.doctor_email) ?? [];
    const sorted = [...reqs].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    return {
      email: link.doctor_email,
      name: profile?.full_name || nameByEmail.get(link.doctor_email) || link.doctor_email,
      phone: profile?.phone ?? null,
      hospitals: Array.isArray(profile?.hospitals) ? (profile!.hospitals as string[]) : [],
      claimed: profile?.claimed ?? false,
      linked_at: link.created_at,
      requests: reqs,
      total: reqs.length,
      done: reqs.filter((r) => r.status === "done").length,
      incoming: reqs.filter((r) => r.status === "incoming").length,
      revenue: reqs.reduce((s, r) => s + r.revenue, 0),
      first_request_at: sorted[0]?.created_at ?? null,
      last_request_at: sorted.length ? sorted[sorted.length - 1].created_at : null,
    };
  });
}

// ── Playbook ────────────────────────────────────────────────────────────────

export type PlaybookBucket = "activate" | "winback" | "thank_expand" | "nudge";

export interface PlaybookItem {
  email: string;
  name: string;
  phone: string | null;
  hospital: string | null;
  reason: string;
  detail?: string; // e.g. request code for nudge
}

export interface Playbook {
  activate: PlaybookItem[];
  winback: PlaybookItem[];
  thank_expand: PlaybookItem[];
  nudge: PlaybookItem[];
}

export function buildPlaybook(doctors: NetworkDoctor[], now = new Date()): Playbook {
  const t = now.getTime();
  const base = (d: NetworkDoctor): Omit<PlaybookItem, "reason" | "detail"> => ({
    email: d.email, name: d.name, phone: d.phone, hospital: d.hospitals[0] ?? null,
  });

  const activate: PlaybookItem[] = [];
  const winback: PlaybookItem[] = [];
  const thank_expand: PlaybookItem[] = [];
  const nudge: PlaybookItem[] = [];

  for (const d of doctors) {
    // Activate — linked but never sent a request.
    if (d.total === 0) {
      const days = Math.floor((t - d.linked_at.getTime()) / DAY);
      activate.push({ ...base(d), reason: days > 0 ? `Added ${days}d ago — no request yet` : "Just added — no request yet" });
      continue;
    }

    // Thank & expand — first request in the last 7 days, or a strong recent week.
    const recent = d.requests.filter((r) => t - r.created_at.getTime() <= 7 * DAY).length;
    if ((d.first_request_at && t - d.first_request_at.getTime() <= 7 * DAY) || recent >= 3) {
      thank_expand.push({
        ...base(d),
        reason: d.first_request_at && t - d.first_request_at.getTime() <= 7 * DAY
          ? "Sent their first request — thank them & ask for a colleague intro"
          : `${recent} requests this week — thank them & ask for a referral`,
      });
    }

    // Win-back — was active, silent 14–90 days.
    if (d.last_request_at) {
      const silent = Math.floor((t - d.last_request_at.getTime()) / DAY);
      if (silent >= 14 && silent <= 90) {
        winback.push({ ...base(d), reason: `No request in ${silent} days — check in` });
      }
    }

    // Nudge — referred a patient still not seen after 2+ days.
    const stale = d.requests.find((r) => r.status === "incoming" && t - r.created_at.getTime() >= 2 * DAY);
    if (stale) {
      nudge.push({ ...base(d), reason: "Referred patient hasn't arrived — ask the doctor to remind them", detail: stale.code });
    }
  }

  return { activate, winback, thank_expand, nudge };
}

// ── Doctor proof card ─────────────────────────────────────────────────────────

export interface DoctorProof {
  email: string;
  name: string;
  patients_served: number; // completed requests
  total_requests: number;
  tests_count: number;
  avg_result_hours: number | null;
  revenue: number;
  since: Date | null;
}

export function buildProof(doctors: NetworkDoctor[], email: string): DoctorProof | null {
  const d = doctors.find((x) => x.email === email.toLowerCase()) ?? doctors.find((x) => x.email === email);
  if (!d) return null;

  let totalHours = 0;
  let resulted = 0;
  let testsCount = 0;
  for (const r of d.requests) {
    testsCount += r.tests.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length;
    if (r.status === "done" && r.seen_at && r.completed_at) {
      totalHours += (r.completed_at.getTime() - r.seen_at.getTime()) / (60 * 60 * 1000);
      resulted++;
    }
  }

  return {
    email: d.email,
    name: d.name,
    patients_served: d.done,
    total_requests: d.total,
    tests_count: testsCount,
    avg_result_hours: resulted > 0 ? Math.round((totalHours / resulted) * 10) / 10 : null,
    revenue: d.revenue,
    since: d.first_request_at,
  };
}

// ── Territory ─────────────────────────────────────────────────────────────────

export interface TerritoryGroup {
  hospital: string;
  doctor_count: number;
  active_count: number; // request in last 30d
  dormant_count: number;
  revenue: number;
}

export function buildTerritory(doctors: NetworkDoctor[], now = new Date()): TerritoryGroup[] {
  const t = now.getTime();
  const map = new Map<string, TerritoryGroup>();
  for (const d of doctors) {
    const hospitals = d.hospitals.length ? d.hospitals : ["Unassigned"];
    const active = d.last_request_at ? t - d.last_request_at.getTime() <= 30 * DAY : false;
    for (const h of hospitals) {
      const g = map.get(h) ?? { hospital: h, doctor_count: 0, active_count: 0, dormant_count: 0, revenue: 0 };
      g.doctor_count++;
      if (active) g.active_count++; else g.dormant_count++;
      g.revenue += d.revenue;
      map.set(h, g);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.doctor_count - a.doctor_count);
}

// ── Goals: weekly progress + streak ───────────────────────────────────────────

function startOfWeek(d: Date): number {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x.getTime();
}

export function buildGoalStats(doctors: NetworkDoctor[], now = new Date()) {
  const weekStart = startOfWeek(now);
  // Doctors with at least one request this week.
  const activeThisWeek = doctors.filter((d) => d.requests.some((r) => r.created_at.getTime() >= weekStart)).length;
  // New activations this week (first request this week).
  const activatedThisWeek = doctors.filter((d) => d.first_request_at && d.first_request_at.getTime() >= weekStart).length;

  // Streak: consecutive weeks (ending last week) with >=1 request across the network.
  const weeksWithActivity = new Set<number>();
  for (const d of doctors) {
    for (const r of d.requests) weeksWithActivity.add(startOfWeek(r.created_at));
  }
  let streak = 0;
  let cursor = weekStart - 7 * DAY;
  while (weeksWithActivity.has(cursor)) {
    streak++;
    cursor -= 7 * DAY;
  }
  if (weeksWithActivity.has(weekStart)) streak++; // count current week if active

  return { activeThisWeek, activatedThisWeek, streak };
}
