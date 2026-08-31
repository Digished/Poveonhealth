export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getConsultSettings } from "@/lib/consult";
import {
  commitBonusPool, computeBonusPool, periodOf, periodsBack, readBonusPool,
} from "@/lib/doctor-bonus";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/consults/bonus-pool?period=YYYY-MM
 *
 * A stored pool if one exists, otherwise what this month currently looks like.
 * The live figure is what an admin needs while the month is still running; the
 * stored one is what was actually decided.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = req.nextUrl.searchParams.get("period") || periodOf();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Period must look like 2026-08." }, { status: 400 });
  }

  const settings = await getConsultSettings();
  const stored = await readBonusPool(period);
  const pool = stored ?? (await computeBonusPool(period, settings.bonus_pool_percent));

  // Which months already have a stored pool, so the picker can say so.
  const known = await prisma.doctorBonusPool.findMany({
    select: { period: true, status: true, pool_naira: true },
    orderBy: { period: "desc" },
    take: 24,
  });

  return NextResponse.json({
    success: true,
    saved: !!stored,
    default_percent: settings.bonus_pool_percent,
    pool,
    periods: periodsBack(12).map((p) => {
      const hit = known.find((k) => k.period === p);
      return { period: p, status: hit?.status ?? null, pool_naira: hit ? Number(hit.pool_naira) : null };
    }),
  });
}

const BodySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must look like 2026-08"),
  action: z.enum(["compute", "mark_paid", "reopen"]),
  /** Overrides the programme default for this one month. */
  pool_percent: z.coerce.number().min(0).max(100).optional(),
});

/**
 * POST — compute a month's split, freeze it as paid, or reopen a draft.
 *
 * "Paid" is a one-way door under normal use: reopening exists because a pool
 * marked paid by accident on the wrong month should be recoverable, but it is
 * a deliberate second action rather than a silent recompute.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { period, action } = parsed.data;

  if (action === "compute") {
    const settings = await getConsultSettings();
    const percent = parsed.data.pool_percent ?? settings.bonus_pool_percent;
    const result = await commitBonusPool(period, percent);
    if (!result.ok) {
      return NextResponse.json(
        { error: "That month is already marked paid. Reopen it first if it needs recomputing." },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, pool: await readBonusPool(period) });
  }

  if (action === "mark_paid") {
    const pool = await prisma.doctorBonusPool.findUnique({ where: { period } });
    if (!pool) {
      return NextResponse.json({ error: "Work the month out before marking it paid." }, { status: 404 });
    }
    // Compare-and-set, so two admins pressing at once cannot both "first" it.
    const { count } = await prisma.doctorBonusPool.updateMany({
      where: { period, status: { not: "paid" } },
      data: { status: "paid", paid_at: new Date(), paid_by: admin.email ?? null },
    });
    if (!count) return NextResponse.json({ error: "That month was already marked paid." }, { status: 409 });
    return NextResponse.json({ success: true, pool: await readBonusPool(period) });
  }

  await prisma.doctorBonusPool.updateMany({
    where: { period, status: "paid" },
    data: { status: "draft", paid_at: null, paid_by: null },
  });
  return NextResponse.json({ success: true, pool: await readBonusPool(period) });
}
