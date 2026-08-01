export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The single summary feed behind the admin Metrics tab: headline KPIs for the
 * selected window, the same KPIs for the immediately preceding window of equal
 * length (so the UI can show movement), a bucketed time series for the graph,
 * and the breakdowns worth seeing at a glance.
 *
 * Self-service vs referral is the split that matters most here, so it runs
 * through every layer — totals, series, and per-lab.
 *
 * "Self-service" = the patient started the request themselves, which the data
 * models as a request with no doctor_email (the self-service and QR intake
 * routes both leave it null). Anything with a doctor_email came from a referring
 * doctor.
 */

const SELF_SERVICE = `r.doctor_email IS NULL`;

/** Requests that have reached the lab — the ones that earn commission. */
const REALISED_STATUSES = ["seen", "done"];

type Totals = {
  requests: number;
  self_service: number;
  referrals: number;
  incoming: number;
  seen: number;
  done: number;
  cancelled: number;
  completion_rate: number;
  unique_patients: number;
  active_labs: number;
  active_doctors: number;
  commission: number;
  lab_revenue: number;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Postgres booleans arrive as `true` or as the string "true" depending on cast. */
function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "t";
}

const DAY_MS = 86400_000;
const DEFAULT_DAYS = 30;

function startOfUtcDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(0, 0, 0, 0);
  return c;
}

function endOfUtcDay(d: Date): Date {
  const c = new Date(d);
  c.setUTCHours(23, 59, 59, 999);
  return c;
}

/**
 * Inclusive whole-day bounds in UTC, matching how the requests route reads them.
 *
 * Both ends are snapped to day boundaries so `days` is always the inclusive
 * calendar-day count — "1 Jan → 30 Jan" is 30 days, not 29. The UI matches its
 * range presets against that number, so an off-by-one here would silently stop
 * the preset chips highlighting.
 */
function parseRange(fromParam: string | null, toParam: string | null) {
  const now = new Date();

  const toParsed = toParam ? new Date(`${toParam}T23:59:59.999Z`) : null;
  const to = toParsed && !isNaN(toParsed.getTime()) ? toParsed : endOfUtcDay(now);

  // No explicit start: default to the last 30 days so the graph always has
  // something to draw and the deltas always have a comparison window.
  const defaultFrom = new Date(startOfUtcDay(to).getTime() - (DEFAULT_DAYS - 1) * DAY_MS);
  const fromParsed = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : null;
  let from = fromParsed && !isNaN(fromParsed.getTime()) ? startOfUtcDay(fromParsed) : defaultFrom;

  // A backwards range would produce a negative span and a nonsense comparison.
  if (from.getTime() > to.getTime()) from = startOfUtcDay(to);

  const spanMs = to.getTime() - from.getTime() + 1; // +1ms → whole days
  return {
    from,
    to,
    days: Math.max(1, Math.round(spanMs / DAY_MS)),
    // Previous window of equal length, ending the instant the current one starts.
    prevFrom: new Date(from.getTime() - spanMs),
    prevTo: new Date(from.getTime() - 1),
  };
}

/** Headline numbers for one window. One round trip, one scan. */
async function totalsFor(from: Date, to: Date): Promise<Totals> {
  const rows = await prisma.$queryRaw<Array<Record<string, string>>>`
    SELECT
      COUNT(*)::text                                                          AS requests,
      COUNT(*) FILTER (WHERE r.doctor_email IS NULL)::text                    AS self_service,
      COUNT(*) FILTER (WHERE r.doctor_email IS NOT NULL)::text                AS referrals,
      COUNT(*) FILTER (WHERE r.status = 'incoming')::text                     AS incoming,
      COUNT(*) FILTER (WHERE r.status = 'seen')::text                         AS seen,
      COUNT(*) FILTER (WHERE r.status = 'done')::text                         AS done,
      COUNT(*) FILTER (WHERE r.status = 'cancelled')::text                    AS cancelled,
      COUNT(DISTINCT r.patient_phone) FILTER (WHERE r.patient_phone IS NOT NULL)::text AS unique_patients,
      COUNT(DISTINCT r.lab_id)::text                                          AS active_labs,
      COUNT(DISTINCT r.doctor_email)::text                                    AS active_doctors,
      COALESCE(SUM(r.poveon_amount)      FILTER (WHERE r.status IN ('seen','done')), 0)::text AS commission,
      COALESCE(SUM(r.lab_revenue_amount) FILTER (WHERE r.status IN ('seen','done')), 0)::text AS lab_revenue
    FROM requests r
    WHERE r.created_at >= ${from} AND r.created_at <= ${to}`;

  const t = rows[0] ?? {};
  const requests = num(t.requests);
  const done = num(t.done);

  return {
    requests,
    self_service: num(t.self_service),
    referrals: num(t.referrals),
    incoming: num(t.incoming),
    seen: num(t.seen),
    done,
    cancelled: num(t.cancelled),
    completion_rate: requests > 0 ? Math.round((done / requests) * 1000) / 10 : 0,
    unique_patients: num(t.unique_patients),
    active_labs: num(t.active_labs),
    active_doctors: num(t.active_doctors),
    commission: num(t.commission),
    lab_revenue: num(t.lab_revenue),
  };
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const range = parseRange(searchParams.get("from"), searchParams.get("to"));
    const { from, to, days, prevFrom, prevTo } = range;

    // Long windows get weekly buckets so the graph stays legible rather than
    // turning into a year of daily noise.
    const bucket: "day" | "week" = days > 92 ? "week" : "day";

    const [current, previous, seriesRaw, sourceRaw, topLabsRaw, topDoctorsRaw, tatRaw] = await Promise.all([
      totalsFor(from, to),
      totalsFor(prevFrom, prevTo),

      // Time series — one row per bucket, zero-filled below.
      prisma.$queryRawUnsafe<Array<Record<string, string | Date>>>(
        `SELECT date_trunc($3, r.created_at) AS bucket,
                COUNT(*)::text                                            AS total,
                COUNT(*) FILTER (WHERE ${SELF_SERVICE})::text             AS self_service,
                COUNT(*) FILTER (WHERE r.doctor_email IS NOT NULL)::text  AS referrals,
                COUNT(*) FILTER (WHERE r.status = 'done')::text           AS done,
                COALESCE(SUM(r.poveon_amount) FILTER (WHERE r.status IN ('seen','done')), 0)::text AS commission
         FROM requests r
         WHERE r.created_at >= $1 AND r.created_at <= $2
         GROUP BY 1 ORDER BY 1`,
        from, to, bucket
      ),

      // How self-service clients reached the lab, and what they say referred them.
      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          COALESCE(r.source, 'poveon')                       AS source,
          COALESCE(r.referral_type, 'unspecified')           AS referral_type,
          (r.doctor_email IS NULL)                           AS is_self_service,
          COUNT(*)::text                                     AS count
        FROM requests r
        WHERE r.created_at >= ${from} AND r.created_at <= ${to}
        GROUP BY 1, 2, 3`,

      prisma.$queryRaw<Array<Record<string, string>>>`
        SELECT r.lab_id,
               l.name                                                    AS lab_name,
               COUNT(*)::text                                            AS total,
               COUNT(*) FILTER (WHERE r.doctor_email IS NULL)::text      AS self_service,
               COUNT(*) FILTER (WHERE r.doctor_email IS NOT NULL)::text  AS referrals,
               COUNT(*) FILTER (WHERE r.status = 'done')::text           AS done,
               COALESCE(SUM(r.poveon_amount) FILTER (WHERE r.status IN ('seen','done')), 0)::text AS commission
        FROM requests r
        JOIN labs l ON l.id = r.lab_id
        WHERE r.created_at >= ${from} AND r.created_at <= ${to}
        GROUP BY r.lab_id, l.name
        ORDER BY COUNT(*) DESC
        LIMIT 12`,

      prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT LOWER(r.doctor_email)                                AS email,
               MAX(COALESCE(dp.full_name, r.doctor_name))           AS name,
               MAX(COALESCE(dp.prefix, r.doctor_prefix))            AS prefix,
               MAX(r.doctor_hospital)                               AS hospital,
               (MAX(CASE WHEN dp.email IS NULL THEN 0 ELSE 1 END) = 1) AS registered,
               COUNT(*)::text                                       AS total,
               COUNT(*) FILTER (WHERE r.status = 'done')::text      AS done
        FROM requests r
        LEFT JOIN doctor_profiles dp ON LOWER(dp.email) = LOWER(r.doctor_email)
        WHERE r.created_at >= ${from} AND r.created_at <= ${to}
          AND r.doctor_email IS NOT NULL
        GROUP BY LOWER(r.doctor_email)
        ORDER BY COUNT(*) DESC
        LIMIT 12`,

      // Turnaround: median is the honest summary here — a handful of requests
      // left open for weeks would drag a mean beyond usefulness.
      prisma.$queryRaw<Array<Record<string, string>>>`
        SELECT
          (PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (r.seen_at - r.created_at)) / 60
          ))::text AS median_to_seen_mins,
          (PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (r.completed_at - r.seen_at)) / 60
          ))::text AS median_seen_to_done_mins
        FROM requests r
        WHERE r.created_at >= ${from} AND r.created_at <= ${to}`,
    ]);

    // ── Zero-fill the series so gaps read as "no requests", not "no data" ──
    const stepMs = bucket === "week" ? 7 * 86400_000 : 86400_000;
    const byBucket = new Map<string, Record<string, string | Date>>();
    for (const row of seriesRaw) {
      byBucket.set(new Date(row.bucket as Date).toISOString().slice(0, 10), row);
    }

    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    if (bucket === "week") {
      // Postgres truncates weeks to Monday; align our cursor the same way.
      const dow = (cursor.getUTCDay() + 6) % 7;
      cursor.setUTCDate(cursor.getUTCDate() - dow);
    }

    const series: Array<{
      date: string; total: number; self_service: number; referrals: number; done: number; commission: number;
    }> = [];
    // Guard against a pathological range producing an unbounded loop.
    for (let i = 0; cursor.getTime() <= to.getTime() && i < 400; i++) {
      const key = cursor.toISOString().slice(0, 10);
      const row = byBucket.get(key);
      series.push({
        date: key,
        total: num(row?.total),
        self_service: num(row?.self_service),
        referrals: num(row?.referrals),
        done: num(row?.done),
        commission: num(row?.commission),
      });
      cursor.setTime(cursor.getTime() + stepMs);
    }

    // ── Channel breakdown ──
    const bySource: Record<string, number> = {};
    const byReferralType: Record<string, number> = {};
    for (const row of sourceRaw) {
      const count = num(row.count);
      const source = String(row.source);
      bySource[source] = (bySource[source] ?? 0) + count;
      // referral_type is only collected at self-service/QR intake, so it only
      // describes how self-service clients say they were referred.
      if (bool(row.is_self_service)) {
        const rt = String(row.referral_type);
        byReferralType[rt] = (byReferralType[rt] ?? 0) + count;
      }
    }

    return NextResponse.json({
      success: true,
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
        days,
        bucket,
        prev_from: prevFrom.toISOString(),
        prev_to: prevTo.toISOString(),
      },
      totals: current,
      previous,
      series,
      split: {
        self_service: current.self_service,
        referrals: current.referrals,
        by_source: bySource,
        by_referral_type: byReferralType,
      },
      top_labs: topLabsRaw.map((r) => ({
        lab_id: String(r.lab_id),
        lab_name: String(r.lab_name),
        total: num(r.total),
        self_service: num(r.self_service),
        referrals: num(r.referrals),
        done: num(r.done),
        commission: num(r.commission),
      })),
      top_doctors: topDoctorsRaw.map((r) => ({
        email: String(r.email),
        name: [r.prefix, r.name].filter(Boolean).join(" ").trim() || String(r.email),
        hospital: r.hospital ? String(r.hospital) : null,
        registered: bool(r.registered),
        total: num(r.total),
        done: num(r.done),
      })),
      turnaround: {
        median_to_seen_mins: tatRaw[0]?.median_to_seen_mins != null ? num(tatRaw[0].median_to_seen_mins) : null,
        median_seen_to_done_mins: tatRaw[0]?.median_seen_to_done_mins != null ? num(tatRaw[0].median_seen_to_done_mins) : null,
      },
      realised_statuses: REALISED_STATUSES,
    });
  } catch (error) {
    console.error("[admin/metrics]", error);
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
