export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { periodOf } from "@/lib/doctor-bonus";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/doc-login/consults/bonus — this doctor's bonus history.
 *
 * Only months that have actually been worked out are returned, and a draft is
 * labelled as one: a doctor should never be shown a figure as settled when an
 * admin can still recompute it.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  const email = await getDoctorEmailFromConsultRequest(req);
  if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const shares = await prisma.doctorBonusShare.findMany({
    where: { doctor_email: email },
    include: { pool: { select: { period: true, status: true, pool_naira: true, paid_at: true } } },
    orderBy: { pool: { period: "desc" } },
    take: 12,
  });

  const rows = shares.map((s) => ({
    period: s.pool.period,
    status: s.pool.status,
    paid_at: s.pool.paid_at,
    pool_naira: Number(s.pool.pool_naira),
    share_percent: Number(s.share_percent),
    amount_naira: Number(s.amount_naira),
    patients: s.patients,
    messages: s.messages,
  }));

  const thisPeriod = periodOf();
  return NextResponse.json({
    success: true,
    // Everything settled, and this month separately — it is still moving.
    paid_total: rows
      .filter((r) => r.status === "paid")
      .reduce((sum, r) => sum + r.amount_naira, 0),
    current: rows.find((r) => r.period === thisPeriod) ?? null,
    rows,
  });
}
