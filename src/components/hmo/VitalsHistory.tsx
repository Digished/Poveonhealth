"use client";

import { Activity, Droplets } from "lucide-react";
import { TrendChart, TrendSeries } from "@/components/hmo/TrendChart";

export type Reading = {
  id: string;
  type: "bp" | "sugar";
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  glucose_mg_dl: string | number | null; // Prisma Decimal serialises as string
  glucose_context: "fasting" | "random" | null;
  note: string | null;
  recorded_at: string;
};

// Validated categorical slots 1 (blue) and 2 (aqua); aqua is below 3:1 on
// white so series are also direct-labeled and listed in the table below.
const SERIES_BLUE = "#2a78d6";
const SERIES_AQUA = "#1baf7a";

export function bpSeries(readings: Reading[]): TrendSeries[] {
  const bp = readings.filter((r) => r.type === "bp").reverse(); // oldest → newest
  return [
    { name: "Systolic", color: SERIES_BLUE, points: bp.map((r) => ({ t: Date.parse(r.recorded_at), v: r.systolic! })) },
    { name: "Diastolic", color: SERIES_AQUA, points: bp.map((r) => ({ t: Date.parse(r.recorded_at), v: r.diastolic! })) },
  ];
}

export function sugarSeries(readings: Reading[]): TrendSeries[] {
  const sugar = readings.filter((r) => r.type === "sugar").reverse();
  const byContext = (ctx: "fasting" | "random") =>
    sugar
      .filter((r) => r.glucose_context === ctx)
      .map((r) => ({ t: Date.parse(r.recorded_at), v: Number(r.glucose_mg_dl) }));
  return [
    { name: "Fasting", color: SERIES_BLUE, points: byContext("fasting") },
    { name: "Random", color: SERIES_AQUA, points: byContext("random") },
  ].filter((s) => s.points.length > 0);
}

export function formatReading(r: Reading): string {
  if (r.type === "bp") {
    return `${r.systolic}/${r.diastolic} mmHg${r.pulse ? ` · ${r.pulse} bpm` : ""}`;
  }
  return `${Number(r.glucose_mg_dl)} mg/dL (${r.glucose_context})`;
}

export function VitalsHistory({ readings }: { readings: Reading[] }) {
  const hasBp = readings.some((r) => r.type === "bp");
  const hasSugar = readings.some((r) => r.type === "sugar");

  return (
    <div className="space-y-5">
      <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
          <Activity className="w-4 h-4 text-medical-600" /> Blood Pressure Trend
        </h3>
        <TrendChart
          series={hasBp ? bpSeries(readings) : []}
          unit="mmHg"
          thresholds={[{ value: 140, label: "140 sys" }, { value: 90, label: "90 dia" }]}
        />
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
          <Droplets className="w-4 h-4 text-medical-600" /> Blood Sugar Trend
        </h3>
        <TrendChart
          series={hasSugar ? sugarSeries(readings) : []}
          unit="mg/dL"
          thresholds={[{ value: 126, label: "126 fasting" }, { value: 200, label: "200 random" }]}
        />
      </div>

      <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Recent Readings</h3>
        {readings.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {readings.slice(0, 20).map((r) => (
              <li key={r.id} className="py-2.5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    {r.type === "bp"
                      ? <Activity className="w-3.5 h-3.5 text-medical-500" />
                      : <Droplets className="w-3.5 h-3.5 text-medical-500" />}
                    {formatReading(r)}
                  </p>
                  {r.note && <p className="text-xs text-slate-400 mt-0.5">{r.note}</p>}
                </div>
                <p className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(r.recorded_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
