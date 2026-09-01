export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

type Row = { key: string | null; n: bigint };
type Numbers = {
  bp: bigint;
  bp_very_high: bigint;
  bp_high: bigint;
  bp_raised: bigint;
  bp_target: bigint;
  bp_systolic_avg: number | null;
  bp_diastolic_avg: number | null;
  glucose_fasting: bigint;
  glucose_fasting_avg: number | null;
  glucose_fasting_high: bigint;
  glucose_random: bigint;
  glucose_random_avg: number | null;
  glucose_random_high: bigint;
};

/**
 * GET /api/admin/consults/baseline — how the membership looked on day one.
 *
 * Everything here is derived from the answers members give before they pay, so
 * it is the one view of the population that is not skewed by who has been
 * chatting to their doctor since.
 */
export async function GET(_req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [total, captured, adherence, hypertension, diabetes, numbers] = await Promise.all([
      prisma.consultPatient.count(),
      prisma.consultPatient.count({ where: { baseline_captured_at: { not: null } } }),
      prisma.$queryRaw<Row[]>`
        SELECT medication_adherence AS key, COUNT(*)::bigint AS n
        FROM consult_patients
        WHERE baseline_captured_at IS NOT NULL AND medication_adherence IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC`,
      prisma.$queryRaw<Row[]>`
        SELECT hypertension_years::text AS key, COUNT(*)::bigint AS n
        FROM consult_patients
        WHERE hypertension_years IS NOT NULL
        GROUP BY 1 ORDER BY hypertension_years ASC`,
      prisma.$queryRaw<Row[]>`
        SELECT diabetes_years::text AS key, COUNT(*)::bigint AS n
        FROM consult_patients
        WHERE diabetes_years IS NOT NULL
        GROUP BY 1 ORDER BY diabetes_years ASC`,
      prisma.$queryRaw<Numbers[]>`
        SELECT
          COUNT(*) FILTER (WHERE bp IS NOT NULL)::bigint AS bp,
          COUNT(*) FILTER (WHERE sys >= 180 OR dia >= 120)::bigint AS bp_very_high,
          COUNT(*) FILTER (WHERE (sys >= 140 OR dia >= 90) AND NOT (sys >= 180 OR dia >= 120))::bigint AS bp_high,
          COUNT(*) FILTER (WHERE (sys >= 130 OR dia >= 80) AND NOT (sys >= 140 OR dia >= 90))::bigint AS bp_raised,
          COUNT(*) FILTER (WHERE bp IS NOT NULL AND sys < 130 AND dia < 80)::bigint AS bp_target,
          ROUND(AVG(sys))::int AS bp_systolic_avg,
          ROUND(AVG(dia))::int AS bp_diastolic_avg,
          COUNT(*) FILTER (WHERE ctx = 'fasting')::bigint AS glucose_fasting,
          ROUND(AVG(glu) FILTER (WHERE ctx = 'fasting'))::int AS glucose_fasting_avg,
          COUNT(*) FILTER (WHERE ctx = 'fasting' AND glu >= 126)::bigint AS glucose_fasting_high,
          COUNT(*) FILTER (WHERE ctx = 'random')::bigint AS glucose_random,
          ROUND(AVG(glu) FILTER (WHERE ctx = 'random'))::int AS glucose_random_avg,
          COUNT(*) FILTER (WHERE ctx = 'random' AND glu >= 200)::bigint AS glucose_random_high
        FROM (
          SELECT
            baseline_bp_systolic AS sys,
            baseline_bp_diastolic AS dia,
            CASE WHEN baseline_bp_systolic IS NOT NULL AND baseline_bp_diastolic IS NOT NULL
                 THEN 1 END AS bp,
            baseline_glucose_mg_dl AS glu,
            baseline_glucose_context AS ctx
          FROM consult_patients
          WHERE baseline_captured_at IS NOT NULL
        ) t`,
    ]);

    const n = numbers[0];
    const num = (v: bigint | null | undefined) => Number(v ?? 0);

    return NextResponse.json({
      success: true,
      total_members: total,
      captured,
      adherence: adherence.map((r) => ({ key: r.key ?? "unknown", count: num(r.n) })),
      hypertension_years: hypertension.map((r) => ({ years: Number(r.key), count: num(r.n) })),
      diabetes_years: diabetes.map((r) => ({ years: Number(r.key), count: num(r.n) })),
      bp: {
        reported: num(n?.bp),
        very_high: num(n?.bp_very_high),
        high: num(n?.bp_high),
        raised: num(n?.bp_raised),
        at_target: num(n?.bp_target),
        systolic_avg: n?.bp_systolic_avg ?? null,
        diastolic_avg: n?.bp_diastolic_avg ?? null,
      },
      glucose: {
        fasting: num(n?.glucose_fasting),
        fasting_avg: n?.glucose_fasting_avg ?? null,
        fasting_high: num(n?.glucose_fasting_high),
        random: num(n?.glucose_random),
        random_avg: n?.glucose_random_avg ?? null,
        random_high: num(n?.glucose_random_high),
      },
    });
  } catch (err) {
    console.error("[admin/consults/baseline]", err);
    return NextResponse.json({ error: "Could not load baseline statistics." }, { status: 500 });
  }
}
