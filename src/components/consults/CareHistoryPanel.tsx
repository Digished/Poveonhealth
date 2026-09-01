"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import { Activity, ClipboardList, FlaskConical, Pill, TicketPercent, TrendingUp } from "lucide-react";
import { SectionLoader } from "@/components/PageLoader";
import { describeLog } from "@/lib/treatment-plan";
import { bpBand } from "@/components/consults/baseline";
import { MonthFilter, monthKey, monthsFrom } from "@/components/ui/MonthFilter";

type Log = {
  id: string;
  item_label: string;
  measure: string;
  measure_label: string | null;
  note: string | null;
  systolic: number | null;
  diastolic: number | null;
  glucose_mg_dl: number | null;
  weight_kg: number | null;
  value_number: number | null;
  value_text: string | null;
  logged_for: string;
  created_at: string;
};

type HistoryEvent = {
  when: string;
  title: string;
  detail: string;
  kind: "test" | "medication" | "saving" | "plan";
};

const KIND_ICON = {
  test: FlaskConical,
  medication: Pill,
  saving: TicketPercent,
  plan: ClipboardList,
} as const;

const KIND_TONE = {
  test: "bg-medical-50 text-medical-600",
  medication: "bg-emerald-50 text-emerald-600",
  saving: "bg-amber-50 text-amber-600",
  plan: "bg-sky-50 text-sky-600",
} as const;

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Everything that has happened on the member's plan, and how their numbers are
 * moving.
 *
 * The trend is the part that makes a year of ticking feel like it was for
 * something: a column per reading, most recent last, with the direction of
 * travel stated in words underneath rather than left to be read off the bars.
 */
export function CareHistoryPanel({
  events,
  shareHistory,
  onShareChange,
}: {
  events: HistoryEvent[];
  /** Whether a new doctor inherits this history. */
  shareHistory: boolean;
  onShareChange: (share: boolean) => void;
}) {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [month, setMonth] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/consults/plan", { cache: "no-store" });
      const d = await res.json();
      if (!d.success) { setError(d.error ?? "Could not load your readings."); return; }
      setLogs(d.logs ?? []);
    } catch {
      setError("Network error.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The trend always reads the whole series — narrowing it to one month would
  // hide exactly the movement it exists to show. Only the lists filter.
  const series = useMemo(() => buildSeries(logs ?? []), [logs]);

  const months = useMemo(
    () => monthsFrom([...events.map((e) => e.when), ...(logs ?? []).map((l) => l.logged_for)]),
    [events, logs]
  );
  const shownEvents = month ? events.filter((e) => monthKey(e.when) === month) : events;
  const shownLogs = (logs ?? []).filter((l) => !month || monthKey(l.logged_for) === month);

  return (
    <div className="space-y-4">
      {logs === null && !error ? (
        <SectionLoader label="Loading your history…" />
      ) : (
        <>
          <MonthFilter
            months={months}
            value={month}
            onChange={setMonth}
            allLabel="Everything"
            allCount={events.length}
          />

          {series.length > 0 && (
            <div className="space-y-4">
              {series.map((s) => (
                <TrendCard key={s.key} series={s} />
              ))}
            </div>
          )}

          {logs !== null && logs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center">
              <TrendingUp className="mx-auto mb-2 h-7 w-7 text-slate-200" />
              <p className="text-sm font-semibold text-slate-600">No readings yet</p>
              <p className="mt-1 text-xs text-slate-400">
                When you tick something on your plan that asks for a number — your blood pressure,
                your sugar — it is plotted here so you can see which way it is going.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Everything so far
            </h3>
            {shownEvents.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">
                {month ? "Nothing that month." : "Nothing has happened yet."}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {shownEvents.map((e, i) => {
                  const Icon = KIND_ICON[e.kind];
                  return (
                    <li key={`${e.title}-${i}`} className="flex gap-3">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${KIND_TONE[e.kind]}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700">{e.title}</p>
                        <p className="text-[11px] text-slate-400">
                          {e.detail} · {formatDay(e.when)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {shownLogs.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Your log</h3>
              <ul className="mt-3 space-y-2">
                {shownLogs.slice(0, 40).map((l) => (
                  <li key={l.id} className="rounded-xl bg-slate-50 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-slate-700">{l.item_label}</p>
                      <span className="shrink-0 text-[11px] text-slate-400">{formatDay(l.logged_for)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">{describeLog(l)}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Moved here from the plan: it is about the record, so it belongs
              beside the record. */}
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              If your doctor changes
            </h3>
            <label className="mt-3 flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={shareHistory}
                onChange={(e) => onShareChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-medical-600"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-700">
                  Share this history with a new doctor
                </span>
                <span className="block text-xs text-slate-500">
                  Everything above goes with you, so you don&apos;t start over. Turn it off and a new
                  doctor sees only what happens from the day they take over.
                </span>
              </span>
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}

type Series = {
  key: string;
  label: string;
  unit: string;
  points: { at: string; value: number; second?: number; label: string }[];
  /** Higher is worse for everything we plot here. */
  goodWhenLower: true;
};

/** Group the log into the things worth plotting. */
function buildSeries(logs: Log[]): Series[] {
  const asc = [...logs].sort(
    (a, b) => new Date(a.logged_for).getTime() - new Date(b.logged_for).getTime()
  );

  const out: Series[] = [];

  const bp = asc.filter((l) => l.systolic != null && l.diastolic != null);
  if (bp.length >= 2) {
    out.push({
      key: "bp",
      label: "Blood pressure",
      unit: "mmHg",
      goodWhenLower: true,
      points: bp.map((l) => ({
        at: l.logged_for,
        value: l.systolic!,
        second: l.diastolic!,
        label: `${l.systolic}/${l.diastolic}`,
      })),
    });
  }

  const sugar = asc.filter((l) => l.glucose_mg_dl != null);
  if (sugar.length >= 2) {
    out.push({
      key: "glucose",
      label: "Blood sugar",
      unit: "mg/dL",
      goodWhenLower: true,
      points: sugar.map((l) => ({
        at: l.logged_for,
        value: l.glucose_mg_dl!,
        label: String(l.glucose_mg_dl),
      })),
    });
  }

  const weight = asc.filter((l) => l.weight_kg != null);
  if (weight.length >= 2) {
    out.push({
      key: "weight",
      label: "Weight",
      unit: "kg",
      goodWhenLower: true,
      points: weight.map((l) => ({
        at: l.logged_for,
        value: l.weight_kg!,
        label: String(l.weight_kg),
      })),
    });
  }

  return out;
}

/**
 * A column per reading. Deliberately not a line chart: on a phone, twelve
 * columns you can actually see beats a smooth line nobody can read a value off.
 */
function TrendCard({ series }: { series: Series }) {
  const points = series.points.slice(-12);
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);

  const first = points[0].value;
  const last = points[points.length - 1].value;
  const change = last - first;
  const direction =
    Math.abs(change) < span * 0.05
      ? { text: "Holding steady", tone: "text-slate-500" }
      : change < 0
        ? { text: `Down ${Math.abs(Math.round(change))} ${series.unit} since you started logging`, tone: "text-emerald-600" }
        : { text: `Up ${Math.round(change)} ${series.unit} since you started logging`, tone: "text-amber-600" };

  const band = series.key === "bp" ? bpBand(last, points[points.length - 1].second ?? null) : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Activity className="h-3.5 w-3.5" /> {series.label}
        </h3>
        <span className="text-sm font-extrabold text-slate-800">
          {points[points.length - 1].label}
          <span className="ml-1 text-[11px] font-normal text-slate-400">{series.unit}</span>
        </span>
      </div>

      <div className="mt-3 flex h-24 items-end gap-1.5">
        {points.map((p, i) => {
          // A floor of 12% keeps the smallest reading visible as a bar.
          const height = 12 + ((p.value - min) / span) * 78;
          const latest = i === points.length - 1;
          return (
            <div key={`${p.at}-${i}`} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`w-full rounded-t ${latest ? "bg-medical-500" : "bg-medical-200"}`}
                style={{ height: `${height}%` }}
                title={`${p.label} on ${formatDay(p.at)}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex justify-between text-[10px] text-slate-400">
        <span>{formatDay(points[0].at)}</span>
        <span>{formatDay(points[points.length - 1].at)}</span>
      </div>

      <p className={`mt-2 text-xs font-semibold ${direction.tone}`}>
        {direction.text}
        {band && band.label !== "—" ? ` · latest reads ${band.label.toLowerCase()}` : ""}
      </p>
    </div>
  );
}
