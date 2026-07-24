"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Users, Check, CreditCard, UserCheck, RefreshCw, MapPin, FlaskConical, Stethoscope, Building2, PieChart } from "lucide-react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";

const TatPanel = dynamic(() => import("@/components/lab/TatPanel").then((m) => ({ default: m.TatPanel })), { ssr: false });
const LabMarketerAnalytics = dynamic(() => import("@/components/LabMarketerAnalytics").then((m) => ({ default: m.LabMarketerAnalytics })), { ssr: false });

interface Row {
  id: string;
  code: string;
  status: string;
  source: string;
  patient_name: string | null;
  patient_age: number | null;
  sex: string | null;
  address: string | null;
  doctor_prefix: string | null;
  doctor_name: string | null;
  doctor_hospital: string | null;
  tests: string;
  referral_type: string | null;
  payment_mode: string | null;
  is_paid: boolean;
  created_at: string;
  arrived_at: string | null;
  attended_at: string | null;
  completed_at: string | null;
  arrived: boolean;
}

type Preset = "all" | "today" | "7d" | "30d" | "year" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

const SOURCE_LABEL: Record<string, string> = { poveon: "App referral", qr: "Self-service QR", walk_in: "Walk-in" };
const REFERRAL_LABEL: Record<string, string> = { self: "Self referred", doctor: "Doctor / hospital", hmo: "HMO" };
const PAYMENT_LABEL: Record<string, string> = { cash: "Cash", card: "Card", transfer: "Transfer", bill_hospital: "Bill to hospital / HMO", hmo: "HMO" };

/** Parse "LGA, State, Country" out of the stored address. */
function parseLocation(address: string | null): { lga: string | null; state: string | null; country: string | null } {
  if (!address) return { lga: null, state: null, country: null };
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) return { lga: parts[0], state: parts[1], country: parts[parts.length - 1] };
  if (parts.length === 2) return { lga: null, state: parts[0], country: parts[1] };
  return { lga: null, state: null, country: null };
}

function topCounts(values: (string | null | undefined)[], limit = 10): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = (v ?? "").trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/** Card of ranked horizontal bars — the workhorse of this page. */
function BarCard({ title, icon, data, empty }: { title: string; icon?: React.ReactNode; data: [string, number][]; empty?: string }) {
  const max = data.length > 0 ? data[0][1] : 1;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{icon} {title}</p>
      {data.length === 0 ? (
        <p className="text-sm text-slate-500">{empty ?? "No data yet."}</p>
      ) : (
        <div className="space-y-2.5">
          {data.map(([name, count]) => (
            <div key={name}>
              <div className="mb-0.5 flex justify-between gap-2 text-sm">
                <span className="truncate text-slate-300">{name}</span>
                <span className="shrink-0 text-slate-400">{count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${Math.round((count / max) * 100)}%`, backgroundColor: "#0e8fe5" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Analytics — everything the lab gathers, in one clean, mobile-friendly page:
 * volumes over time, where clients come from (state / LGA), how they were
 * referred, how they pay, demographics and the tests they order. Available in
 * both Lite and LIMS; LIMS adds turnaround-time and marketer analytics.
 */
export function AnalyticsView({ labId, lite }: { labId: string; lite: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/lab/customers", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setRows(data.customers ?? []);
    } catch {
      if (!silent) toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const range = useMemo((): { from: number | null; to: number | null } => {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    switch (preset) {
      case "today": return { from: startOfDay.getTime(), to: null };
      case "7d": return { from: Date.now() - 7 * 86400000, to: null };
      case "30d": return { from: Date.now() - 30 * 86400000, to: null };
      case "year": return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: null };
      case "custom": return {
        from: from ? new Date(from + "T00:00:00").getTime() : null,
        to: to ? new Date(to + "T23:59:59").getTime() : null,
      };
      default: return { from: null, to: null };
    }
  }, [preset, from, to]);

  const filtered = useMemo(() => rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    if (range.from != null && t < range.from) return false;
    if (range.to != null && t > range.to) return false;
    return true;
  }), [rows, range]);

  const m = useMemo(() => {
    const total = filtered.length;
    const arrived = filtered.filter((r) => r.arrived).length;
    const attended = filtered.filter((r) => r.attended_at || r.status === "done").length;
    const paidCount = filtered.filter((r) => r.is_paid).length;

    const sources = topCounts(filtered.map((r) => SOURCE_LABEL[r.source ?? "poveon"] ?? r.source));
    const referrals = topCounts(filtered.map((r) => (r.referral_type ? REFERRAL_LABEL[r.referral_type] ?? r.referral_type : r.source === "poveon" ? "App referral" : null)));
    const payments = topCounts(filtered.map((r) => (r.payment_mode ? PAYMENT_LABEL[r.payment_mode] ?? r.payment_mode : null)));

    const sexes = topCounts(filtered.map((r) => {
      const s = (r.sex ?? "").toLowerCase();
      return ["male", "female", "other"].includes(s) ? s.charAt(0).toUpperCase() + s.slice(1) : null;
    }));

    const AGE_BUCKETS: [string, (a: number) => boolean][] = [
      ["0–17", (a) => a < 18],
      ["18–29", (a) => a >= 18 && a < 30],
      ["30–44", (a) => a >= 30 && a < 45],
      ["45–59", (a) => a >= 45 && a < 60],
      ["60+", (a) => a >= 60],
    ];
    const ages: [string, number][] = AGE_BUCKETS
      .map(([label, fn]): [string, number] => [label, filtered.filter((r) => r.patient_age != null && fn(r.patient_age)).length])
      .filter(([, c]) => c > 0);

    const tests = topCounts(filtered.flatMap((r) =>
      (r.tests ?? "")
        .split(/[,\n]+/)
        .map((t) => t.trim())
        .filter((t) => t && t !== "See attached image" && !t.toLowerCase().startsWith("notes:") && t.toLowerCase() !== "to be confirmed at the lab")
    ), 12);

    const locs = filtered.map((r) => parseLocation(r.address));
    const states = topCounts(locs.map((l) => l.state));
    const lgas = topCounts(locs.map((l) => (l.lga && l.state ? `${l.lga} (${l.state})` : l.lga)));

    const doctors = topCounts(filtered
      .filter((r) => r.doctor_name && !["Self Service", "Walk-in", "Doctor Referral", "HMO Referral"].includes(r.doctor_name))
      .map((r) => [r.doctor_prefix, r.doctor_name].filter(Boolean).join(" ")), 8);
    const orgs = topCounts(filtered.map((r) => r.doctor_hospital), 8);

    // Volume trend — daily for ranges ≤ 31 days, monthly otherwise.
    const times = filtered.map((r) => new Date(r.created_at).getTime());
    const minT = times.length > 0 ? Math.min(...times) : Date.now();
    const spanDays = (Date.now() - (range.from ?? minT)) / 86400000;
    const daily = preset === "today" || spanDays <= 31;
    const trendMap = new Map<string, number>();
    for (const r of filtered) {
      const d = new Date(r.created_at);
      const key = daily
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    }
    const trend = Array.from(trendMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-14)
      .map(([key, count]) => ({
        label: daily
          ? new Date(key + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : new Date(key + "-15T12:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        count,
      }));

    return { total, arrived, attended, paidCount, sources, referrals, payments, sexes, ages, tests, states, lgas, doctors, orgs, trend };
  }, [filtered, range, preset]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>;
  }

  const maxTrend = Math.max(1, ...m.trend.map((t) => t.count));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Analytics</h2>
          <p className="mt-1 text-sm text-slate-400">Everything your lab gathers — clients, sources, locations, demographics and tests.</p>
        </div>
        <button
          onClick={() => load(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${preset === p.key ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none" />
            <span className="text-xs text-slate-500">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 outline-none" />
          </div>
        )}
        <span className="ml-auto self-center text-xs text-slate-500">{filtered.length} of {rows.length} records</span>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Clients", value: m.total, icon: <Users className="h-4 w-4 text-medical-300" /> },
          { label: "Arrived", value: m.arrived, icon: <Check className="h-4 w-4 text-emerald-400" /> },
          { label: "Paid", value: m.paidCount, icon: <CreditCard className="h-4 w-4 text-sky-300" /> },
          { label: "Attended / done", value: m.attended, icon: <UserCheck className="h-4 w-4 text-violet-300" /> },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">{s.icon} {s.label}</p>
            <p className="mt-1 text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Volume trend */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Registrations over time</p>
        {m.trend.length === 0 ? (
          <p className="text-sm text-slate-500">No registrations in this period.</p>
        ) : (
          <div className="no-scrollbar overflow-x-auto">
            <div className="flex min-w-[280px] items-end gap-2" style={{ height: 120 }}>
              {m.trend.map((t) => (
                <div key={t.label} className="flex min-w-[36px] flex-1 flex-col items-center justify-end gap-1 self-stretch">
                  <span className="text-[10px] text-slate-300">{t.count}</span>
                  <div className="w-full rounded-t-md" style={{ height: `${Math.max(6, (t.count / maxTrend) * 80)}px`, backgroundColor: "#0e8fe5", opacity: 0.85 }} />
                  <span className="whitespace-nowrap text-[9px] text-slate-500">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Breakdown grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BarCard title="How clients reach you" icon={<PieChart className="h-3.5 w-3.5" />} data={m.sources} />
        <BarCard title="Referral types" icon={<Stethoscope className="h-3.5 w-3.5" />} data={m.referrals} />
        <BarCard title="Payment modes" icon={<CreditCard className="h-3.5 w-3.5" />} data={m.payments} empty="No payment-mode data yet — collected via the self-service form." />
        <BarCard title="Sex demographics" icon={<Users className="h-3.5 w-3.5" />} data={m.sexes} />
        <BarCard title="Age groups" icon={<Users className="h-3.5 w-3.5" />} data={m.ages} />
        <BarCard title="States clients come from" icon={<MapPin className="h-3.5 w-3.5" />} data={m.states} empty="No location data yet — collected via the self-service form." />
        <BarCard title="Local governments" icon={<MapPin className="h-3.5 w-3.5" />} data={m.lgas} empty="No location data yet — collected via the self-service form." />
        <BarCard title="Top referring doctors" icon={<Stethoscope className="h-3.5 w-3.5" />} data={m.doctors} empty="No named referring doctors in this period." />
        <BarCard title="Hospitals / HMOs / companies" icon={<Building2 className="h-3.5 w-3.5" />} data={m.orgs} empty="No referring organisations in this period." />
        <BarCard title="Tests ordered" icon={<FlaskConical className="h-3.5 w-3.5" />} data={m.tests} />
      </div>

      {/* LIMS-only: turnaround time + marketer performance */}
      {!lite && (
        <>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Turnaround time</h3>
            <TatPanel />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Marketer performance</p>
            <LabMarketerAnalytics labId={labId} />
          </div>
        </>
      )}
    </div>
  );
}
