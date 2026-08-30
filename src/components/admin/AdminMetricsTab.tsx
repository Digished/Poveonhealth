"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-hot-toast";
import {
  RefreshCw, CreditCard, ArrowUpRight, ArrowDownRight, Minus,
  Users, FlaskConical, Stethoscope, Timer, QrCode, Footprints, Globe, TrendingUp,
} from "lucide-react";
import { format } from "date-fns";
import { MetricsTrendChart, type TrendBucket, type TrendMetric } from "@/components/admin/MetricsTrendChart";

/**
 * Admin → Metrics.
 *
 * One page answering "how is the business moving": headline KPIs against the
 * previous equal-length period, a trend graph, and the breakdowns that explain
 * the numbers (self-service vs referral, pipeline, top labs, top doctors).
 */

/**
 * Settlement reporting (cash received from labs, and what's still owed) is
 * hidden until the wallet/DVA reconciliation is trusted. Flip this to true to
 * bring back, in one go: the "Total Received"/"Net Outstanding" cards, the
 * Deposited/Owed columns in the lab table, and the DVA deposit feed. They are
 * all the same number viewed three ways, so they show and hide together.
 */
const SHOW_SETTLEMENT_METRICS = false;

const DATE_TIME = "dd MMM yy · HH:mm";

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

type MetricsSummary = {
  range: { from: string; to: string; days: number; bucket: "day" | "week"; prev_from: string; prev_to: string };
  totals: Totals;
  previous: Totals;
  series: TrendBucket[];
  split: {
    self_service: number;
    referrals: number;
    by_source: Record<string, number>;
    by_referral_type: Record<string, number>;
  };
  top_labs: { lab_id: string; lab_name: string; total: number; self_service: number; referrals: number; done: number; commission: number }[];
  top_doctors: { email: string; name: string; hospital: string | null; registered: boolean; total: number; done: number }[];
  turnaround: { median_to_seen_mins: number | null; median_seen_to_done_mins: number | null };
};

export type RevenueData = {
  total_poveon_earned: number;
  total_lab_revenue: number;
  total_received: number;
  total_outstanding: number;
  by_lab: { lab_id: string; lab_name: string; request_count: number; total_poveon_amount: number; total_lab_revenue: number; total_deposited: number; wallet_balance: number | null; owed: number }[];
  recent_requests: { id: string; code: string; lab_id: string; lab_name: string; patient_name: string | null; tests: string; poveon_amount: number; lab_revenue_amount: number; is_paid_to_poveon: boolean; seen_at: string | null }[];
  recent_dva_credits: { id: string; lab_id: string; lab_name: string; amount: number; reference: string; channel: string; sender_name: string | null; sender_bank: string | null; created_at: string }[];
};

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "12m", days: 365 },
] as const;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Percentage movement vs the previous period. null = no baseline to compare against. */
function delta(current: number, previous: number): { pct: number | null; isNew: boolean } {
  if (previous === 0) return { pct: null, isNew: current > 0 };
  return { pct: ((current - previous) / previous) * 100, isNew: false };
}

function formatMinutes(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(mins / (60 * 24));
  const h = Math.round((mins % (60 * 24)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export function AdminMetricsTab() {
  const [from, setFrom] = useState<string>(() => isoDay(new Date(Date.now() - 29 * 86400_000)));
  const [to, setTo] = useState<string>(() => isoDay(new Date()));
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartMetric, setChartMetric] = useState<TrendMetric>("requests");

  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(true);

  const fetchSummary = useCallback(async (f: string, t: string, initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const p = new URLSearchParams();
      if (f) p.set("from", f);
      if (t) p.set("to", t);
      const res = await fetch(`/api/admin/metrics?${p.toString()}`);
      const data = await res.json();
      if (data.success) setSummary(data);
      else toast.error(data.error ?? "Failed to load metrics");
    } catch {
      toast.error("Failed to load metrics");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  const fetchRevenue = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const res = await fetch("/api/admin/revenue");
      const data = await res.json();
      if (data.success) setRevenue(data);
    } catch {
      toast.error("Failed to load revenue");
    } finally {
      setRevenueLoading(false);
    }
  }, []);

  useEffect(() => { fetchRevenue(); }, [fetchRevenue]);

  // Debounced so dragging the date inputs doesn't fire a request per keystroke.
  useEffect(() => {
    const initial = summary === null;
    const t = setTimeout(() => fetchSummary(from, to, initial), initial ? 0 : 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, fetchSummary]);

  function applyPreset(days: number) {
    setFrom(isoDay(new Date(Date.now() - (days - 1) * 86400_000)));
    setTo(isoDay(new Date()));
  }

  const activePreset = useMemo(() => {
    if (!summary) return null;
    return PRESETS.find((p) => p.days === summary.range.days)?.label ?? null;
  }, [summary]);

  if (loading) {
    return (
      <div className="animate-fade-in space-y-6">
        <div className="h-14 animate-pulse rounded-2xl border border-white/8 bg-white/5" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/5" />)}
        </div>
        <div className="h-80 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
      </div>
    );
  }

  if (!summary) return <p className="py-16 text-center text-slate-500">No data available</p>;

  const { totals, previous, split, top_labs, top_doctors, turnaround, series, range } = summary;

  return (
    <div className="animate-fade-in space-y-6">
      {/* ── Range controls ── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/8 bg-white/3 px-4 py-3">
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                activePreset === p.label
                  ? "bg-medical-500/20 text-medical-300 ring-1 ring-medical-500/40"
                  : "text-slate-400 hover:bg-white/8 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">From</label>
          <input
            type="date" value={from} max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/8 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-medical-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">To</label>
          <input
            type="date" value={to} min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/8 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-medical-500"
          />
        </div>
        <button
          onClick={() => { fetchSummary(from, to); fetchRevenue(); }}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />Refresh
        </button>
        <span className="ml-auto text-[11px] text-slate-500">
          {refreshing
            ? "Updating…"
            : `${range.days} day${range.days === 1 ? "" : "s"} · vs previous ${range.days} day${range.days === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* ── Headline KPIs ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi
          label="Total requests" value={totals.requests} prev={previous.requests}
          accent="blue" icon={<TrendingUp className="h-4 w-4" />}
        />
        <Kpi
          label="Self-service" value={totals.self_service} prev={previous.self_service}
          accent="sky" icon={<QrCode className="h-4 w-4" />}
          footnote={`${pct(totals.self_service, totals.requests)}% of requests`}
        />
        <Kpi
          label="Doctor referrals" value={totals.referrals} prev={previous.referrals}
          accent="violet" icon={<Stethoscope className="h-4 w-4" />}
          footnote={`${pct(totals.referrals, totals.requests)}% of requests`}
        />
        <Kpi
          label="Completed" value={totals.done} prev={previous.done}
          accent="emerald" icon={<CreditCard className="h-4 w-4" />}
          footnote={`${totals.completion_rate}% completion rate`}
        />
        <Kpi
          label="Commission accrued" value={totals.commission} prev={previous.commission}
          accent="emerald" currency
          footnote="from arrived + completed"
        />
        <Kpi
          label="Lab revenue" value={totals.lab_revenue} prev={previous.lab_revenue}
          accent="sky" currency
          footnote="labs' share of test fees"
        />
        <Kpi
          label="Active labs" value={totals.active_labs} prev={previous.active_labs}
          accent="blue" icon={<FlaskConical className="h-4 w-4" />}
          footnote="labs with ≥1 request"
        />
        <Kpi
          label="Referring doctors" value={totals.active_doctors} prev={previous.active_doctors}
          accent="violet" icon={<Users className="h-4 w-4" />}
          footnote={`${totals.unique_patients} unique patient${totals.unique_patients === 1 ? "" : "s"}`}
        />
      </div>

      {/* ── Trend graph ── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">How things are moving</h3>
            <p className="text-[11px] text-slate-500">
              {range.bucket === "week" ? "Weekly" : "Daily"}{" "}
              {chartMetric === "commission"
                ? "commission from requests that reached the lab"
                : "volume, stacked by where the request came from"}
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5">
            {([["requests", "Requests"], ["commission", "Commission"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setChartMetric(key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  chartMetric === key ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <MetricsTrendChart series={series} bucket={range.bucket} metric={chartMetric} />
      </div>

      {/* ── Channel split + pipeline ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Self-service vs referrals */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Self-service vs referrals</h3>

          <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full bg-white/8">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct(split.self_service, totals.requests)}%` }} />
            <div className="h-full bg-violet-500 transition-all" style={{ width: `${pct(split.referrals, totals.requests)}%` }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SplitStat color="bg-sky-500" label="Self-service" value={split.self_service} share={pct(split.self_service, totals.requests)} />
            <SplitStat color="bg-violet-500" label="Doctor referrals" value={split.referrals} share={pct(split.referrals, totals.requests)} />
          </div>

          {/* How self-service clients reached the lab */}
          <div className="mt-5 border-t border-white/8 pt-4">
            <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Intake channel</p>
            <div className="space-y-2">
              {[
                { key: "qr", label: "QR / self-service page", icon: <QrCode className="h-3.5 w-3.5" /> },
                { key: "walk_in", label: "Walk-in", icon: <Footprints className="h-3.5 w-3.5" /> },
                { key: "poveon", label: "Poveon platform", icon: <Globe className="h-3.5 w-3.5" /> },
              ].map((row) => {
                const count = split.by_source[row.key] ?? 0;
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <span className="text-slate-500">{row.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{row.label}</span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full rounded-full bg-slate-400" style={{ width: `${pct(count, totals.requests)}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-xs text-slate-400">{count}</span>
                  </div>
                );
              })}
            </div>
            {Object.keys(split.by_referral_type).length > 0 && (
              <p className="mt-3 text-[11px] text-slate-500">
                Self-service clients say they were referred by:{" "}
                {Object.entries(split.by_referral_type)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => `${k === "unspecified" ? "not stated" : k} (${v})`)
                  .join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Pipeline + turnaround */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Pipeline</h3>
          <div className="space-y-3">
            <Funnel label="Incoming" sub="awaiting the patient" value={totals.incoming} total={totals.requests} color="bg-blue-500" />
            <Funnel label="Arrived" sub="seen at the lab" value={totals.seen} total={totals.requests} color="bg-amber-500" />
            <Funnel label="Completed" sub="results sent" value={totals.done} total={totals.requests} color="bg-emerald-500" />
            {totals.cancelled > 0 && (
              <Funnel label="Cancelled" sub="" value={totals.cancelled} total={totals.requests} color="bg-rose-500" />
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Timer className="h-3 w-3" />Request → arrival
              </p>
              <p className="mt-1 text-xl font-bold text-white">{formatMinutes(turnaround.median_to_seen_mins)}</p>
              <p className="text-[10px] text-slate-500">median</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Timer className="h-3 w-3" />Arrival → results
              </p>
              <p className="mt-1 text-xl font-bold text-white">{formatMinutes(turnaround.median_seen_to_done_mins)}</p>
              <p className="text-[10px] text-slate-500">median</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Top labs ── */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="mb-4 text-sm font-semibold text-slate-200">Labs in this period</h3>
        {top_labs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No requests in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-cards">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-2 py-2 text-left font-semibold">Lab</th>
                  <th className="px-2 py-2 text-right font-semibold">Requests</th>
                  <th className="px-2 py-2 text-right font-semibold">Self-service</th>
                  <th className="px-2 py-2 text-right font-semibold">Referrals</th>
                  <th className="px-2 py-2 text-right font-semibold">Completed</th>
                  <th className="px-2 py-2 text-right font-semibold">Commission</th>
                </tr>
              </thead>
              <tbody>
                {top_labs.map((lab) => (
                  <tr key={lab.lab_id} className="border-b border-white/5 last:border-0">
                    <td className="max-w-[220px] truncate px-2 py-2.5 text-white" data-label="Lab">{lab.lab_name}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-slate-200" data-label="Requests">{lab.total}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-sky-400" data-label="Self-service">{lab.self_service}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-violet-400" data-label="Referrals">{lab.referrals}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-emerald-400" data-label="Completed">{lab.done}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-emerald-300" data-label="Commission">₦{lab.commission.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Top referring doctors ── */}
      {top_doctors.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Top referring doctors</h3>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {top_doctors.map((doc) => (
              <div key={doc.email} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
                  <Stethoscope className="h-3.5 w-3.5 text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-xs font-medium text-white">{doc.name}</p>
                    {!doc.registered && (
                      <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">unregistered</span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-500">{doc.hospital ?? doc.email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-bold text-white">{doc.total}</p>
                  <p className="text-[10px] text-slate-500">{doc.done} completed</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All-time commission position ── */}
      {revenueLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5" />)}
        </div>
      ) : revenue && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">All-time commission position</h3>
            <button onClick={fetchRevenue} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white">
              <RefreshCw className="h-3 w-3" />Refresh
            </button>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${SHOW_SETTLEMENT_METRICS ? "sm:grid-cols-4" : "sm:grid-cols-2"}`}>
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 p-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">Total Commission Accrued</p>
              <p className="text-3xl font-bold text-white">₦{revenue.total_poveon_earned.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">from all seen/done requests</p>
            </div>
            <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/20 to-sky-600/10 p-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">Total Lab Revenue</p>
              <p className="text-3xl font-bold text-white">₦{revenue.total_lab_revenue.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">labs&apos; share of test fees</p>
            </div>
            {SHOW_SETTLEMENT_METRICS && (
              <>
                <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-violet-600/10 p-5">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">Total Received from Labs</p>
                  <p className="text-3xl font-bold text-white">₦{revenue.total_received.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-slate-500">cash deposited via DVA</p>
                </div>
                <div className={`rounded-2xl border bg-gradient-to-br p-5 ${revenue.total_outstanding === 0 ? "border-emerald-500/30 from-emerald-500/20 to-emerald-600/10" : "border-amber-500/30 from-amber-500/20 to-amber-600/10"}`}>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">Net Outstanding</p>
                  <p className={`text-3xl font-bold ${revenue.total_outstanding === 0 ? "text-emerald-300" : "text-amber-300"}`}>
                    ₦{revenue.total_outstanding.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{revenue.total_outstanding === 0 ? "fully settled" : "still owed to Poveon"}</p>
                </div>
              </>
            )}
          </div>

          {/* Per-lab commission — all time */}
          {revenue.by_lab.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-300">Lab Commission Breakdown (all time)</h3>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {revenue.by_lab.map((row) => (
                  <div key={row.lab_id} className="flex items-center gap-3 border-b border-white/5 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white">{row.lab_name}</p>
                      <p className="text-xs text-slate-500">
                        {row.request_count} request{row.request_count !== 1 ? "s" : ""}
                        {SHOW_SETTLEMENT_METRICS && row.wallet_balance === null && <span className="ml-1.5 text-amber-500">· no wallet</span>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-xs">
                      <div className="text-right">
                        <p className="text-slate-400">Commission</p>
                        <p className="font-mono font-bold text-emerald-400">₦{row.total_poveon_amount.toLocaleString()}</p>
                      </div>
                      {SHOW_SETTLEMENT_METRICS && (
                        <>
                          <div className="text-right">
                            <p className="text-slate-400">Deposited</p>
                            <p className="font-mono font-bold text-violet-400">₦{row.total_deposited.toLocaleString()}</p>
                          </div>
                          <div className="min-w-[60px] text-right">
                            <p className="text-slate-400">Owed</p>
                            <p className={`font-mono font-bold ${row.owed === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                              {row.owed === 0 ? "Settled" : `₦${row.owed.toLocaleString()}`}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent commission activity */}
          {revenue.recent_requests.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-300">Recent Commission Activity</h3>
              <div className="max-h-[32rem] space-y-1 overflow-y-auto pr-1">
                {revenue.recent_requests.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                      <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-xs font-medium text-white">{req.code}</p>
                        <p className="truncate text-xs text-slate-500">{req.lab_name}</p>
                      </div>
                      <p className="truncate text-xs text-slate-600">{req.patient_name ?? "Patient"} · {req.tests.slice(0, 60)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold text-emerald-400">₦{req.poveon_amount.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">
                        {req.seen_at ? format(new Date(req.seen_at), DATE_TIME) : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {SHOW_SETTLEMENT_METRICS && revenue.recent_dva_credits.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-300">Recent DVA Deposits</h3>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {revenue.recent_dva_credits.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white">{c.lab_name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {c.sender_name ? `From ${c.sender_name}` : "Bank transfer"}{c.sender_bank ? ` · ${c.sender_bank}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold text-violet-300">+₦{c.amount.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">{format(new Date(c.created_at), DATE_TIME)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

const ACCENTS = {
  blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
  sky: "from-sky-500/20 to-sky-600/10 border-sky-500/30",
  violet: "from-violet-500/20 to-violet-600/10 border-violet-500/30",
  emerald: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
} as const;

function Kpi({
  label, value, prev, accent, currency, footnote, icon,
}: {
  label: string;
  value: number;
  prev: number;
  accent: keyof typeof ACCENTS;
  currency?: boolean;
  footnote?: string;
  icon?: React.ReactNode;
}) {
  const { pct: change, isNew } = delta(value, prev);
  const up = change != null && change > 0;
  const flat = change != null && Math.abs(change) < 0.05;

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${ACCENTS[accent]}`}>
      <div className="mb-1 flex items-center gap-1.5">
        {icon && <span className="text-slate-400">{icon}</span>}
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      </div>
      <p className="text-3xl font-bold text-white">
        {currency ? `₦${value.toLocaleString()}` : value.toLocaleString()}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        {isNew ? (
          <span className="text-[11px] font-semibold text-emerald-400">new</span>
        ) : change == null ? (
          <span className="text-[11px] text-slate-500">no prior data</span>
        ) : flat ? (
          <span className="flex items-center gap-0.5 text-[11px] text-slate-500"><Minus className="h-3 w-3" />flat</span>
        ) : (
          <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(change) >= 999 ? ">999" : Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}%
          </span>
        )}
        {footnote && <span className="truncate text-[10px] text-slate-500">· {footnote}</span>}
      </div>
    </div>
  );
}

function SplitStat({ color, label, value, share }: { color: string; label: string; value: number; share: number }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />{label}
      </p>
      <p className="mt-0.5 text-2xl font-bold text-white">{value.toLocaleString()}</p>
      <p className="text-[11px] text-slate-500">{share}%</p>
    </div>
  );
}

function Funnel({ label, sub, value, total, color }: { label: string; sub: string; value: number; total: number; color: string }) {
  const share = pct(value, total);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="text-xs text-slate-300">
          {label}
          {sub && <span className="ml-1.5 text-[11px] text-slate-500">{sub}</span>}
        </p>
        <p className="shrink-0 font-mono text-sm text-white">
          {value.toLocaleString()}
          <span className="ml-1.5 text-[11px] text-slate-500">{share}%</span>
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}
