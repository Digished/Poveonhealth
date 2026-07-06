"use client";

import { useMemo, useRef, useState } from "react";

export type TrendPoint = { t: number; v: number }; // t = epoch ms
export type TrendSeries = { name: string; color: string; points: TrendPoint[] };

const W = 640;
const H = 220;
const PAD = { top: 16, right: 88, bottom: 26, left: 40 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = step * mult;
  const start = Math.ceil(min / s) * s;
  const ticks: number[] = [];
  for (let v = start; v <= max; v += s) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * Lightweight SVG line chart for vitals trends: 2px lines, recessive grid,
 * dashed threshold reference lines, legend + direct series labels, and a
 * nearest-point hover tooltip with crosshair.
 */
export function TrendChart({
  series,
  unit,
  thresholds = [],
}: {
  series: TrendSeries[];
  unit: string;
  thresholds?: { value: number; label: string }[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{ si: number; pi: number } | null>(null);

  const drawn = series.filter((s) => s.points.length > 0);

  const { x, y, yTicks } = useMemo(() => {
    const allPoints = drawn.flatMap((s) => s.points);
    const ts = allPoints.map((p) => p.t);
    const vs = [...allPoints.map((p) => p.v), ...thresholds.map((th) => th.value)];
    let tMin = Math.min(...ts);
    let tMax = Math.max(...ts);
    if (tMin === tMax) { tMin -= 12 * 3600 * 1000; tMax += 12 * 3600 * 1000; }
    const vSpan = Math.max(...vs) - Math.min(...vs) || 1;
    const vMin = Math.min(...vs) - vSpan * 0.12;
    const vMax = Math.max(...vs) + vSpan * 0.12;
    return {
      x: (t: number) => PAD.left + ((t - tMin) / (tMax - tMin)) * (W - PAD.left - PAD.right),
      y: (v: number) => H - PAD.bottom - ((v - vMin) / (vMax - vMin)) * (H - PAD.top - PAD.bottom),
      yTicks: niceTicks(vMin, vMax),
    };
  }, [drawn, thresholds]);

  if (drawn.length === 0) {
    return (
      <div className="h-[140px] flex items-center justify-center text-sm text-slate-400">
        No readings yet — log your first one above.
      </div>
    );
  }

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    const my = ((e.clientY - rect.top) / rect.height) * H;
    const candidates = drawn.flatMap((s, si) =>
      s.points.map((p, pi) => ({ si, pi, d: Math.hypot(x(p.t) - mx, y(p.v) - my) }))
    );
    const best = candidates.reduce(
      (a, b) => (a === null || b.d < a.d ? b : a),
      null as { si: number; pi: number; d: number } | null
    );
    setHover(best && best.d < 40 ? { si: best.si, pi: best.pi } : null);
  }

  const hoverPoint = hover ? drawn[hover.si]?.points[hover.pi] : null;

  return (
    <div>
      {/* Legend (two or more series) */}
      {drawn.length >= 2 && (
        <div className="flex flex-wrap gap-4 mb-2">
          {drawn.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto select-none"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Trend chart (${unit})`}
        >
          {/* Recessive grid + y labels */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fontSize={10} fill="#94a3b8">
                {tick}
              </text>
            </g>
          ))}

          {/* Threshold reference lines */}
          {thresholds.map((th) => (
            <g key={th.label}>
              <line
                x1={PAD.left} x2={W - PAD.right}
                y1={y(th.value)} y2={y(th.value)}
                stroke="#f87171" strokeWidth={1} strokeDasharray="4 4"
              />
              <text x={W - PAD.right + 4} y={y(th.value) + 3} fontSize={9} fill="#ef4444">
                {th.label}
              </text>
            </g>
          ))}

          {/* Series lines + direct end labels */}
          {drawn.map((s, si) => {
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
              .join(" ");
            const last = s.points[s.points.length - 1];
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {s.points.map((p, pi) => {
                  const active = hover?.si === si && hover?.pi === pi;
                  return (
                    <circle
                      key={pi}
                      cx={x(p.t)} cy={y(p.v)}
                      r={active ? 5 : 3}
                      fill={s.color}
                      stroke="#ffffff" strokeWidth={2}
                    />
                  );
                })}
                <text x={x(last.t) + 8} y={y(last.v) + 3} fontSize={10} fontWeight={600} fill="#475569">
                  {s.name}
                </text>
              </g>
            );
          })}

          {/* Crosshair on hover */}
          {hoverPoint && (
            <line
              x1={x(hoverPoint.t)} x2={x(hoverPoint.t)}
              y1={PAD.top} y2={H - PAD.bottom}
              stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 3"
            />
          )}

          {/* X-axis extent labels */}
          <text x={PAD.left} y={H - 8} fontSize={10} fill="#94a3b8">
            {new Date(Math.min(...drawn.flatMap((s) => s.points.map((p) => p.t)))).toLocaleDateString()}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={10} fill="#94a3b8">
            {new Date(Math.max(...drawn.flatMap((s) => s.points.map((p) => p.t)))).toLocaleDateString()}
          </text>
        </svg>

        {/* Tooltip */}
        {hover && hoverPoint && (
          <div
            className="absolute pointer-events-none bg-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(x(hoverPoint.t) / W) * 100}%`,
              top: `${(y(hoverPoint.v) / H) * 100}%`,
              marginTop: -8,
            }}
          >
            <span className="font-semibold">{drawn[hover.si].name}:</span> {hoverPoint.v} {unit}
            <span className="block text-slate-300">
              {new Date(hoverPoint.t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
