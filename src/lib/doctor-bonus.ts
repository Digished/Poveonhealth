/**
 * The doctor bonus pool.
 *
 * Each month a share of Poveon's revenue is set aside and split between
 * doctors by how much of that month's messaging they carried. The premise is
 * that a member who writes often is a member who needs more, so the doctor
 * holding them is doing the harder work.
 *
 * Two decisions worth stating, because both could reasonably have gone the
 * other way:
 *
 *  - **Patient-sent messages, not doctor replies.** Replies are the obvious
 *    measure of a doctor's effort and the wrong one to pay on: a doctor can
 *    write four short replies where one would do, and the pool would reward it.
 *    Nobody can make their patients write more, so the demand side is the
 *    measure that cannot be gamed from the inside.
 *  - **Not per head.** Twenty settled members are less work than five who write
 *    every day, and a per-head split would pay the opposite way round.
 *
 * The consequence to be honest about: a doctor whose members are all stable
 * earns nothing from this pool. That is what a stress bonus means. Their
 * per-member monthly fee is unaffected.
 */

import { prisma } from "@/lib/prisma";
import { allocate, periodRange } from "@/lib/doctor-bonus-math";

export { allocate, periodOf, periodRange, periodsBack } from "@/lib/doctor-bonus-math";

export type BonusShare = {
  doctorEmail: string;
  doctorName?: string | null;
  patients: number;
  messages: number;
  weight: number;
  /** Percentage of the pool, to three decimals. */
  sharePercent: number;
  amountNaira: number;
};

export type BonusPool = {
  period: string;
  revenueNaira: number;
  revenueMedication: number;
  revenueOnboarding: number;
  revenueTopups: number;
  poolPercent: number;
  poolNaira: number;
  totalWeight: number;
  shares: BonusShare[];
  status: "draft" | "paid";
  computedAt: string | null;
  paidAt: string | null;
};

/**
 * What Poveon earned in a period.
 *
 * Revenue, not profit — the pool is a share of what came in, so the doctors'
 * own monthly fees are not netted off first. The three parts are returned
 * separately because a total nobody can explain is a total nobody trusts.
 */
export async function revenueFor(period: string) {
  const { start, end } = periodRange(period);

  const [medication, onboarding, topups] = await Promise.all([
    prisma.medicationOrder.aggregate({
      where: { status: { in: ["paid", "ready", "collected"] }, paid_at: { gte: start, lt: end } },
      _sum: { poveon_naira: true },
    }),
    prisma.consultPatient.aggregate({
      where: { status: "active", subscribed_at: { gte: start, lt: end } },
      _sum: { amount_paid: true },
    }),
    prisma.consultTopup.aggregate({
      where: { status: "paid", paid_at: { gte: start, lt: end } },
      _sum: { amount_naira: true },
    }),
  ]);

  const med = Number(medication._sum.poveon_naira ?? 0);
  const onb = Number(onboarding._sum.amount_paid ?? 0);
  const top = Number(topups._sum.amount_naira ?? 0);
  return { medication: med, onboarding: onb, topups: top, total: med + onb + top };
}

/**
 * Work out a period's pool and its split, without writing anything.
 *
 * Safe to call as often as an admin refreshes the page; `commitBonusPool` is
 * what makes it real.
 */
export async function computeBonusPool(period: string, poolPercent: number): Promise<BonusPool> {
  const { start, end } = periodRange(period);

  const [revenue, messages] = await Promise.all([
    revenueFor(period),
    // Patient-sent messages in the period, grouped by the member who sent them.
    prisma.consultMessage.groupBy({
      by: ["patient_id"],
      where: { sender: "patient", created_at: { gte: start, lt: end } },
      _count: { _all: true },
    }),
  ]);

  const byPatient = new Map<string, number>(
    messages.map((m) => [m.patient_id, m._count._all])
  );

  // Who held each of those members. Read after the grouping so only the
  // members who actually wrote are looked up.
  const patients = byPatient.size
    ? await prisma.consultPatient.findMany({
        where: { id: { in: Array.from(byPatient.keys()) } },
        select: { id: true, doctor_email: true },
      })
    : [];

  const perDoctor = new Map<string, { patients: number; messages: number }>();
  for (const p of patients) {
    if (!p.doctor_email) continue; // unassigned members belong to nobody's pool
    const count = byPatient.get(p.id) ?? 0;
    if (count <= 0) continue;
    const row = perDoctor.get(p.doctor_email) ?? { patients: 0, messages: 0 };
    row.patients += 1;
    row.messages += count;
    perDoctor.set(p.doctor_email, row);
  }

  const entries = Array.from(perDoctor.entries()).sort((a, b) => b[1].messages - a[1].messages);
  const poolNaira = Math.round(((revenue.total * poolPercent) / 100) * 100) / 100;
  const allocated = allocate(
    Math.round(poolNaira * 100),
    entries.map(([, v]) => v.messages)
  );
  const totalWeight = entries.reduce((a, [, v]) => a + v.messages, 0);

  // Names, so the display reads as people rather than addresses.
  const profiles = entries.length
    ? await prisma.doctorProfile.findMany({
        where: { email: { in: entries.map(([e]) => e) } },
        select: { email: true, full_name: true, prefix: true },
      })
    : [];
  const nameOf = new Map<string, string | null>(
    profiles.map((p): [string, string | null] => [
      String(p.email),
      p.full_name ? `${p.prefix ? `${p.prefix} ` : ""}${p.full_name}` : null,
    ])
  );

  return {
    period,
    revenueNaira: revenue.total,
    revenueMedication: revenue.medication,
    revenueOnboarding: revenue.onboarding,
    revenueTopups: revenue.topups,
    poolPercent,
    poolNaira,
    totalWeight,
    status: "draft",
    computedAt: null,
    paidAt: null,
    shares: entries.map(([email, v], i): BonusShare => ({
      doctorEmail: String(email),
      doctorName: nameOf.get(email) ?? null,
      patients: v.patients,
      messages: v.messages,
      weight: v.messages,
      sharePercent: totalWeight > 0 ? Math.round((v.messages / totalWeight) * 100_000) / 1000 : 0,
      amountNaira: allocated[i] / 100,
    })),
  };
}

/**
 * Write a period's distribution.
 *
 * A draft can be recomputed as often as anyone likes — the shares are replaced.
 * A pool already marked paid is frozen: what a doctor was paid must still read
 * the same next year, whatever the settings say by then.
 */
export async function commitBonusPool(
  period: string,
  poolPercent: number
): Promise<{ ok: boolean; frozen?: boolean; pool?: BonusPool }> {
  const existing = await prisma.doctorBonusPool.findUnique({ where: { period } });
  if (existing?.status === "paid") return { ok: false, frozen: true };

  const computed = await computeBonusPool(period, poolPercent);

  const pool = await prisma.doctorBonusPool.upsert({
    where: { period },
    create: {
      period,
      revenue_naira: computed.revenueNaira,
      pool_percent: poolPercent,
      pool_naira: computed.poolNaira,
      revenue_medication: computed.revenueMedication,
      revenue_onboarding: computed.revenueOnboarding,
      revenue_topups: computed.revenueTopups,
      total_weight: computed.totalWeight,
    },
    update: {
      revenue_naira: computed.revenueNaira,
      pool_percent: poolPercent,
      pool_naira: computed.poolNaira,
      revenue_medication: computed.revenueMedication,
      revenue_onboarding: computed.revenueOnboarding,
      revenue_topups: computed.revenueTopups,
      total_weight: computed.totalWeight,
      computed_at: new Date(),
    },
  });

  // Replaced wholesale: a doctor who dropped out of the month must not keep a
  // stale share from the previous computation.
  await prisma.doctorBonusShare.deleteMany({ where: { pool_id: pool.id } });
  if (computed.shares.length) {
    await prisma.doctorBonusShare.createMany({
      data: computed.shares.map((s) => ({
        pool_id: pool.id,
        doctor_email: s.doctorEmail,
        patients: s.patients,
        messages: s.messages,
        weight: s.weight,
        share_percent: s.sharePercent,
        amount_naira: s.amountNaira,
      })),
    });
  }

  return { ok: true, pool: { ...computed, computedAt: pool.computed_at.toISOString() } };
}

/** Read a stored pool back, shares and all. */
export async function readBonusPool(period: string): Promise<BonusPool | null> {
  const pool = await prisma.doctorBonusPool.findUnique({
    where: { period },
    include: { shares: { orderBy: { amount_naira: "desc" } } },
  });
  if (!pool) return null;

  const profiles = pool.shares.length
    ? await prisma.doctorProfile.findMany({
        where: { email: { in: pool.shares.map((s) => s.doctor_email) } },
        select: { email: true, full_name: true, prefix: true },
      })
    : [];
  const nameOf = new Map<string, string | null>(
    profiles.map((p): [string, string | null] => [
      String(p.email),
      p.full_name ? `${p.prefix ? `${p.prefix} ` : ""}${p.full_name}` : null,
    ])
  );

  return {
    period: pool.period,
    revenueNaira: Number(pool.revenue_naira),
    revenueMedication: Number(pool.revenue_medication),
    revenueOnboarding: Number(pool.revenue_onboarding),
    revenueTopups: Number(pool.revenue_topups),
    poolPercent: Number(pool.pool_percent),
    poolNaira: Number(pool.pool_naira),
    totalWeight: pool.total_weight,
    status: pool.status === "paid" ? "paid" : "draft",
    computedAt: pool.computed_at.toISOString(),
    paidAt: pool.paid_at?.toISOString() ?? null,
    shares: pool.shares.map((s) => ({
      doctorEmail: s.doctor_email,
      doctorName: nameOf.get(s.doctor_email) ?? null,
      patients: s.patients,
      messages: s.messages,
      weight: s.weight,
      sharePercent: Number(s.share_percent),
      amountNaira: Number(s.amount_naira),
    })),
  };
}
