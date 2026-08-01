"use client";

import { useMemo, useRef, useState } from "react";

/**
 * Stacked-area trend chart for the admin Metrics tab.
 *
 * Inline SVG rather than a charting library — the dashboard ships no chart
 * dependency and this needs to be one small, themeable file.
 *
 * Stacking is the point: self-service and referrals sum to the total, so the
 * band heights read as "where is volume coming from" and the silhouette reads
 * as "is total volume moving" — both questions answered by one shape.
 *
 * Theming: text and grid use `fill/stroke="currentColor"` under a Tailwind text
 * colour, so the dashboard's light-mode CSS overrides carry into the SVG.
 */

export type TrendBucket = {
  date: string; // YYYY-MM-DD
  total: number;
  self_service: number;
  referrals: number;
  done: number;
  commission: number;
};

export type TrendMetric = "requests" | "commission";

const W = 900;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };

const COLORS = {
  selfService: "#0ea5e9", // sky — reads on light and dark
  referrals: "#8b5cf6", // violet
  done: "#10b981", // emerald
};

/** Round axis maximum up to a friendly number so gridlines land on whole values. */
function niceMax(value: number): number {
  if (value <= 0) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

function formatBucketLabel(date: string, bucket: "day" | "week"): string {
  const d = new Date(`${date}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions =
    bucket === "week"
      ? { day: "numeric", month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" };
  return d.toLocaleDateString("en-GB", opts);
}

export function MetricsTrendChart({
  series,
  bucket = "day",
  metric = "requests",
  showCompleted = true,
}: {
  series: TrendBucket[];
  bucket?: "day" | "week";
  metric?: TrendMetric;
  showCompleted?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const n = series.length;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const peak =
      metric === "commission"
        ? Math.max(...series.map((s) => s.commission), 0)
        : Math.max(...series.map((s) => s.total), 0);
    const yMax = niceMax(peak);

    // A single bucket would divide by zero; centre it instead.
    const x = (i: number) => (n <= 1 ? PAD.left + innerW / 2 : PAD.left + (i / (n - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (yMax === 0 ? 0 : (v / yMax) * innerH);

    // Request counts are whole numbers, so a fixed 4-way split would render
    // duplicate labels on small peaks (yMax=2 → "0,1,1,2,2"). Snap the step up
    // to a whole number for counts, and drop any repeats that survive rounding.
    const targetTicks = 4;
    const rawStep = yMax / targetTicks;
    const step = metric === "commission" ? rawStep : Math.max(1, Math.ceil(rawStep));

    const ticks: number[] = [];
    for (let v = 0; v <= yMax + step / 2 && ticks.length <= targetTicks + 1; v += step) {
      const rounded = metric === "commission" ? v : Math.round(v);
      if (!ticks.includes(rounded)) ticks.push(rounded);
      if (step <= 0) break;
    }

    return { x, y, yMax, innerW, innerH, ticks };
  }, [series, metric]);

  if (series.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-slate-500">
        No activity in this period.
      </div>
    );
  }

  const { x, y, yMax, ticks } = geometry;
  const baseline = y(0);

  /** Build a closed area path for a stacked band between two value accessors. */
  function bandPath(lower: (b: TrendBucket) => number, upper: (b: TrendBucket) => number): string {
    const top = series.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(upper(b)).toFixed(1)}`);
    const bottom = series
      .map((b, i) => ({ i, v: lower(b) }))
      .reverse()
      .map(({ i, v }) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    return `${top.join(" ")} ${bottom.join(" ")} Z`;
  }

  function linePath(value: (b: TrendBucket) => number): string {
    return series.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(value(b)).toFixed(1)}`).join(" ");
  }

  const isCommission = metric === "commission";

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const n = series.length;
    if (n <= 1) { setHoverIndex(0); return; }
    const frac = (mx - PAD.left) / (W - PAD.left - PAD.right);
    setHoverIndex(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  }

  const hovered = hoverIndex != null ? series[hoverIndex] : null;

  // Show at most ~7 x-axis labels regardless of bucket count.
  const labelStride = Math.max(1, Math.ceil(series.length / 7));

  return (
    <div>
      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {(isCommission
          ? [{ label: "Commission", color: COLORS.done }]
          : [
              { label: "Self-service", color: COLORS.selfService },
              { label: "Doctor referrals", color: COLORS.referrals },
              ...(showCompleted ? [{ label: "Completed", color: COLORS.done }] : []),
            ]
        ).map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="inline-block h-2 w-2.5 rounded-sm" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="relative text-slate-500">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full select-none overflow-visible"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
          role="img"
          aria-label={isCommission ? "Commission over time" : "Requests over time, split by self-service and doctor referrals"}
        >
          <defs>
            <linearGradient id="mtc-self" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.selfService} stopOpacity={0.55} />
              <stop offset="100%" stopColor={COLORS.selfService} stopOpacity={0.18} />
            </linearGradient>
            <linearGradient id="mtc-ref" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.referrals} stopOpacity={0.55} />
              <stop offset="100%" stopColor={COLORS.referrals} stopOpacity={0.18} />
            </linearGradient>
            <linearGradient id="mtc-comm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.done} stopOpacity={0.5} />
              <stop offset="100%" stopColor={COLORS.done} stopOpacity={0.12} />
            </linearGradient>
          </defs>

          {/* Gridlines + y labels */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)}
                stroke="currentColor" strokeOpacity={0.16} strokeWidth={1}
              />
              <text x={PAD.left - 8} y={y(tick) + 3.5} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.75}>
                {isCommission ? `₦${formatCompact(tick)}` : formatCompact(tick)}
              </text>
            </g>
          ))}

          {isCommission ? (
            <>
              <path d={bandPath(() => 0, (b) => b.commission)} fill="url(#mtc-comm)" />
              <path d={linePath((b) => b.commission)} fill="none" stroke={COLORS.done} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          ) : (
            <>
              {/* Stacked: self-service sits on the baseline, referrals stack on top */}
              <path d={bandPath(() => 0, (b) => b.self_service)} fill="url(#mtc-self)" />
              <path d={bandPath((b) => b.self_service, (b) => b.total)} fill="url(#mtc-ref)" />
              <path d={linePath((b) => b.self_service)} fill="none" stroke={COLORS.selfService} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <path d={linePath((b) => b.total)} fill="none" stroke={COLORS.referrals} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {showCompleted && (
                <path
                  d={linePath((b) => b.done)}
                  fill="none" stroke={COLORS.done} strokeWidth={1.75}
                  strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round"
                />
              )}
            </>
          )}

          {/* Baseline */}
          <line x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} />

          {/* X labels */}
          {series.map((b, i) =>
            i % labelStride === 0 || i === series.length - 1 ? (
              <text key={b.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="currentColor" fillOpacity={0.75}>
                {formatBucketLabel(b.date, bucket)}
              </text>
            ) : null
          )}

          {/* Hover crosshair + markers */}
          {hovered && hoverIndex != null && (
            <g>
              <line
                x1={x(hoverIndex)} x2={x(hoverIndex)} y1={PAD.top} y2={baseline}
                stroke="currentColor" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="3 3"
              />
              {(isCommission
                ? [{ v: hovered.commission, c: COLORS.done }]
                : [
                    { v: hovered.self_service, c: COLORS.selfService },
                    { v: hovered.total, c: COLORS.referrals },
                    ...(showCompleted ? [{ v: hovered.done, c: COLORS.done }] : []),
                  ]
              ).map((p, i) => (
                <circle key={i} cx={x(hoverIndex)} cy={y(p.v)} r={4} fill={p.c} stroke="#0f172a" strokeWidth={1.5} />
              ))}
            </g>
          )}
        </svg>

        {/* Tooltip */}
        {hovered && hoverIndex != null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-white/15 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
            style={{
              left: `${Math.min(88, Math.max(12, (x(hoverIndex) / W) * 100))}%`,
              top: 0,
            }}
          >
            <p className="mb-1 font-semibold text-white">
              {formatBucketLabel(hovered.date, bucket)}
              {bucket === "week" && <span className="ml-1 font-normal text-slate-400">week</span>}
            </p>
            {isCommission ? (
              <p className="font-mono text-emerald-300">₦{hovered.commission.toLocaleString()}</p>
            ) : (
              <div className="space-y-0.5">
                <Row color={COLORS.selfService} label="Self-service" value={hovered.self_service} />
                <Row color={COLORS.referrals} label="Referrals" value={hovered.referrals} />
                {showCompleted && <Row color={COLORS.done} label="Completed" value={hovered.done} />}
                <p className="mt-1 border-t border-white/10 pt-1 text-slate-300">
                  Total <span className="font-mono font-semibold text-white">{hovered.total}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* yMax is surfaced for screen readers via the aria-label on the svg; this
          keeps the visual axis uncluttered while staying describable. */}
      <span className="sr-only">Peak value on this chart: {isCommission ? `₦${yMax}` : yMax}</span>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <p className="flex items-center gap-2 text-slate-300">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
      <span className="ml-auto pl-3 font-mono font-semibold text-white">{value}</span>
    </p>
  );
}
