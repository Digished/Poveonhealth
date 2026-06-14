"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Search, X, Stethoscope, Mail, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const naira = (n: number) => `₦${Math.round(n || 0).toLocaleString("en-NG")}`;
const PLAN_LABEL: Record<string, string> = { single: "Single", monthly: "Monthly", yearly: "Yearly" };

function relTime(iso: string | null): string {
  if (!iso) return "";
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
}

interface EncounterRow {
  id: string;
  code: string;
  doctor_email: string;
  doctor_name: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  plan_type: string;
  status: string;
  amount_paid: number;
  poveon_share: number;
  doctor_share: number;
  paid_at: string | null;
  created_at: string;
}

interface DoctorRow {
  doctor_email: string;
  doctor_name: string;
  gross: number;
  poveon: number;
  doctor_share: number;
  count: number;
}

interface Stats {
  gross: number;
  poveon_revenue: number;
  doctor_payouts: number;
  encounter_count: number;
  doctor_count: number;
}

export function AdminEncountersTab() {
  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [perDoctor, setPerDoctor] = useState<DoctorRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      const res = await fetch(`/api/admin/encounters?${params.toString()}`);
      const d = await res.json();
      if (res.ok && d.success) {
        setEncounters(d.encounters ?? []);
        setPerDoctor(d.perDoctor ?? []);
        setStats(d.stats ?? null);
      } else {
        setError(d.error ?? "Failed to load encounters");
      }
    } catch {
      setError("Network error while loading encounters");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white">Doctor Encounters</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Per-encounter charging · 80% doctor / 20% Poveon
            {!loading && ` · ${encounters.length} shown`}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Revenue stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="Gross processed" value={naira(stats?.gross ?? 0)} />
        <Stat label="Poveon revenue (20%)" value={naira(stats?.poveon_revenue ?? 0)} accent />
        <Stat label="Doctor payouts (80%)" value={naira(stats?.doctor_payouts ?? 0)} />
        <Stat label="Encounters" value={String(stats?.encounter_count ?? 0)} sub={`${stats?.doctor_count ?? 0} doctors`} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by code, patient, or doctor…"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-medical-500 transition" />
        {searchInput && (
          <button onClick={() => setSearchInput("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Per-doctor breakdown */}
      {perDoctor.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
          <p className="px-4 py-2.5 text-[10px] uppercase tracking-wide text-slate-500 border-b border-white/8">Revenue by doctor</p>
          <div className="divide-y divide-white/5">
            {perDoctor.map((d) => (
              <div key={d.doctor_email} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{d.doctor_name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{d.doctor_email} · {d.count} encounter{d.count === 1 ? "" : "s"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white">{naira(d.gross)}</p>
                  <p className="text-[11px] text-medical-300">Poveon {naira(d.poveon)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Encounter list */}
      {loading ? (
        <div className="text-center py-12 text-slate-500"><RefreshCw className="w-6 h-6 mx-auto animate-spin opacity-40" /></div>
      ) : error ? (
        <div className="text-center py-12 text-slate-400">
          <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{error}</p>
          <button onClick={load} className="mt-3 text-xs text-medical-400 hover:underline">Try again</button>
        </div>
      ) : encounters.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Stethoscope className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No encounters found</p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {encounters.map((e) => (
            <div key={e.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-slate-400">{e.code}</span>
                <span className="text-[10px] font-medium border rounded-full px-2 py-0.5 bg-medical-500/15 text-medical-300 border-medical-500/25">{PLAN_LABEL[e.plan_type] ?? e.plan_type}</span>
                <span className="text-[10px] text-slate-600 ml-auto">{relTime(e.paid_at ?? e.created_at)}</span>
              </div>
              <p className="text-sm font-semibold text-white truncate mt-1.5">{e.patient_name}</p>
              <p className="text-[11px] text-slate-500 truncate">to {e.doctor_name}</p>
              <div className="flex items-center gap-3 mt-2 text-[11px]">
                <a href={`mailto:${e.patient_email}`} className="inline-flex items-center gap-1 text-slate-400 hover:text-white truncate"><Mail className="w-3 h-3" />{e.patient_email}</a>
                <a href={`tel:${e.patient_phone}`} className="inline-flex items-center gap-1 text-slate-400 hover:text-white shrink-0"><Phone className="w-3 h-3" /></a>
              </div>
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-white/8 text-xs">
                <span className="text-slate-400">{naira(e.amount_paid)}</span>
                <span className="text-medical-300">Poveon {naira(e.poveon_share)}</span>
                <span className="text-emerald-300">Doctor {naira(e.doctor_share)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${accent ? "border-medical-500/30 bg-medical-500/10" : "border-white/8 bg-white/5"}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 truncate ${accent ? "text-medical-200" : "text-white"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
