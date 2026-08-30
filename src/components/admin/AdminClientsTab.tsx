"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, Users, Check, UserCheck, CreditCard, Hourglass } from "lucide-react";
import toast from "react-hot-toast";

interface LabRow {
  lab_id: string;
  lab_name: string;
  total: number;
  arrived: number;
  attended: number;
  paid: number;
  done: number;
  poveon: number;
  qr: number;
  walk_in: number;
  in_queue: number;
}

interface Totals extends Omit<LabRow, "lab_id" | "lab_name"> { total: number }

type Preset = "all" | "today" | "7d" | "30d" | "year" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Poveon admin — platform-wide client tracking: how many clients each lab is
 * registering, who arrived / was attended / paid, and where they came from
 * (app referral vs QR self-service vs walk-in), filterable by date.
 */
export function AdminClientsTab() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [labs, setLabs] = useState<LabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");

  const range = useMemo((): { from: string; to: string } => {
    const now = new Date();
    const today = isoDay(now);
    switch (preset) {
      case "today": return { from: today, to: today };
      case "7d": return { from: isoDay(new Date(Date.now() - 7 * 86400000)), to: today };
      case "30d": return { from: isoDay(new Date(Date.now() - 30 * 86400000)), to: today };
      case "year": return { from: `${now.getFullYear()}-01-01`, to: today };
      case "custom": return { from, to };
      default: return { from: "", to: "" };
    }
  }, [preset, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const res = await fetch(`/api/admin/clients-stats?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setTotals(data.totals);
      setLabs(data.labs ?? []);
    } catch {
      toast.error("Failed to load client stats");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? labs.filter((l) => l.lab_name.toLowerCase().includes(q)) : labs;
  }, [labs, query]);

  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Clients</h2>
          <p className="mt-1 text-sm text-slate-400">Platform-wide client tracking — arrivals, attendance, payment and sources per lab.</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${preset === p.key ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
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
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
      ) : (
        <>
          {/* Headline stats */}
          {totals && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Clients", value: totals.total, icon: <Users className="h-4 w-4 text-blue-400" />, sub: null },
                { label: "Arrived", value: totals.arrived, icon: <Check className="h-4 w-4 text-emerald-400" />, sub: pct(totals.arrived, totals.total) },
                { label: "Attended / done", value: totals.attended, icon: <UserCheck className="h-4 w-4 text-violet-300" />, sub: pct(totals.attended, totals.total) },
                { label: "Paid", value: totals.paid, icon: <CreditCard className="h-4 w-4 text-sky-300" />, sub: pct(totals.paid, totals.total) },
                { label: "In queue now", value: totals.in_queue, icon: <Hourglass className="h-4 w-4 text-amber-300" />, sub: null },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">{s.icon} {s.label}</p>
                  <p className="mt-1 text-2xl font-bold text-white">{s.value}{s.sub && <span className="ml-1.5 text-xs font-medium text-slate-500">{s.sub}</span>}</p>
                </div>
              ))}
            </div>
          )}

          {/* Source split */}
          {totals && totals.total > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">How clients reached labs</p>
              <div className="space-y-2.5">
                {[
                  { label: "App referrals", value: totals.poveon, color: "#0e8fe5" },
                  { label: "Self-service QR", value: totals.qr, color: "#8b5cf6" },
                  { label: "Walk-ins", value: totals.walk_in, color: "#f59e0b" },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="mb-0.5 flex justify-between text-sm">
                      <span className="text-slate-300">{s.label}</span>
                      <span className="text-slate-400">{s.value} ({pct(s.value, totals.total)})</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full" style={{ width: pct(s.value, totals.total) === "—" ? 0 : pct(s.value, totals.total), backgroundColor: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-lab table */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search labs"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-400 focus:outline-none"
            />
          </div>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 py-14 text-center text-slate-400">
              <Users className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm font-medium">No client activity in this period</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="slim-scroll overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm table-cards">
                  <thead>
                    <tr className="bg-white/5 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 font-semibold">Lab</th>
                      <th className="px-3 py-3 text-right font-semibold">Clients</th>
                      <th className="px-3 py-3 text-right font-semibold">Arrived</th>
                      <th className="px-3 py-3 text-right font-semibold">Attended</th>
                      <th className="px-3 py-3 text-right font-semibold">Paid</th>
                      <th className="px-3 py-3 text-right font-semibold">In queue</th>
                      <th className="px-3 py-3 text-right font-semibold">App</th>
                      <th className="px-3 py-3 text-right font-semibold">QR</th>
                      <th className="px-3 py-3 text-right font-semibold">Walk-in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {shown.map((l) => (
                      <tr key={l.lab_id} className="bg-white/3 transition-colors hover:bg-white/8">
                        <td className="px-4 py-3" data-label="Lab"><p className="max-w-[220px] truncate font-medium text-white">{l.lab_name}</p></td>
                        <td className="px-3 py-3 text-right font-semibold text-white" data-label="Clients">{l.total}</td>
                        <td className="px-3 py-3 text-right text-emerald-300" data-label="Arrived">{l.arrived} <span className="text-[10px] text-slate-500">{pct(l.arrived, l.total)}</span></td>
                        <td className="px-3 py-3 text-right text-violet-300" data-label="Attended">{l.attended}</td>
                        <td className="px-3 py-3 text-right text-sky-300" data-label="Paid">{l.paid}</td>
                        <td className="px-3 py-3 text-right text-amber-300" data-label="In queue">{l.in_queue}</td>
                        <td className="px-3 py-3 text-right text-slate-300" data-label="App">{l.poveon}</td>
                        <td className="px-3 py-3 text-right text-slate-300" data-label="QR">{l.qr}</td>
                        <td className="px-3 py-3 text-right text-slate-300" data-label="Walk-in">{l.walk_in}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
