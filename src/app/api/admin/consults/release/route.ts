export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { periodKey, runMonthlyRelease } from "@/lib/consult";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * POST /api/admin/consults/release — release this month's instalments.
 *
 * Idempotent: the (earning, period) unique key means a second run in the same
 * month pays nobody twice. Runs in batches, so `remaining > 0` in the response
 * means there is more to do — call it again.
 */
export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = periodKey();
  const result = await runMonthlyRelease(period);
  return NextResponse.json({ success: true, period, ...result });
}

/** GET — what the current period has already released. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = periodKey();
  const [agg, doctors] = await Promise.all([
    prisma.consultEarningRelease.aggregate({ where: { period }, _sum: { amount_naira: true }, _count: { id: true } }),
    prisma.consultEarningRelease.groupBy({
      by: ["doctor_email"],
      where: { period },
      _sum: { amount_naira: true },
    }),
  ]);

  return NextResponse.json({
    success: true,
    period,
    released_count: agg._count.id,
    released_amount: Math.round(Number(agg._sum.amount_naira ?? 0)),
    doctors: doctors
      .map((d) => ({ doctor_email: d.doctor_email, amount: Math.round(Number(d._sum.amount_naira ?? 0)) }))
      .sort((a, b) => b.amount - a.amount),
  });
}
