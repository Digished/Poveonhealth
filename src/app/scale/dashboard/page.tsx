"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp, LogOut, RefreshCw, User, Building2,
  Phone, TestTube2, ChevronDown, ChevronUp,
  Clock, CheckCircle, Eye, Plus, X, Loader2,
  ShieldAlert, Search, Calendar, Banknote,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { PrefixSelect } from "@/components/PrefixSelect";
import { BankAccountInput } from "@/components/BankAccountInput";
import { PhoneInput } from "@/components/PhoneInput";
import { HospitalTagInput } from "@/components/ui/HospitalTagInput";

// ─── types ────────────────────────────────────────────────────────────────────

interface Marketer { name: string; email: string }

interface RequestSummary {
  id: string; code: string; patient_name: string; tests: string;
  status: string; lab_revenue_amount: number;
  created_at: string; seen_at: string | null; completed_at: string | null;
}

interface Doctor {
  doctor_email: string; doctor_name: string; doctor_phone: string | null;
  hospitals: string[];          // all clinics
  claimed: boolean;
  total_requests: number; completed_requests: number; total_revenue: number;
  linked_since: string;
  requests: RequestSummary[];
}

interface Stats {
  total_doctors: number; total_requests: number;
  pending: number; seen: number; done: number; total_revenue: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  incoming: { label: "Pending",        color: "bg-amber-50 text-amber-700 border border-amber-200",   icon: <Clock className="w-3 h-3" /> },
  seen:     { label: "Patient Arrived",color: "bg-blue-50 text-blue-700 border border-blue-200",      icon: <Eye className="w-3 h-3" /> },
  done:     { label: "Completed",      color: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <CheckCircle className="w-3 h-3" /> },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function toYM(iso: string) { return iso.slice(0, 7); }          // "2024-03"
function fmtNaira(n: number) {
  if (n === 0) return "₦0";
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toLocaleString()}`;
}
const isRevenue = (s: string) => s === "seen" || s === "done";

// ─── sub-components ───────────────────────────────────────────────────────────

function RevenueCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-0.5">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <span className="text-xl font-bold text-emerald-700 font-mono">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
    </div>
  );
}

function RequestRow({ req }: { req: RequestSummary }) {
  const status = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.incoming;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold text-slate-400 tracking-wider">{req.code}</span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>
            {status.icon}{status.label}
          </span>
          {isRevenue(req.status) && req.lab_revenue_amount > 0 && (
            <span className="text-xs font-semibold text-emerald-600 font-mono">
              {fmtNaira(req.lab_revenue_amount)}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">Patient: <span className="font-semibold text-slate-700">{req.patient_name}</span></p>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed line-clamp-2">{req.tests}</p>
      </div>
      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0 mt-0.5">{fmt(req.created_at)}</span>
    </div>
  );
}

// Hospital search dropdown (portal-style)
function HospitalDropdown({
  hospitals, value, onChange,
}: { hospitals: { name: string; count: number; revenue: number }[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const filtered = hospitals.filter((h) => !q.trim() || h.name.toLowerCase().includes(q.toLowerCase()));
  const selected = hospitals.find((h) => h.name === value);

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition ${
          value ? "border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold" : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        <Building2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        <span className="flex-1 text-left truncate">{selected ? selected.name : "All Hospitals"}</span>
        {value && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="text-emerald-500 hover:text-emerald-700"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-xl">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search hospital…"
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); setQ(""); }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition hover:bg-slate-50 ${!value ? "font-semibold text-emerald-700" : "text-slate-700"}`}
            >
              <span>All Hospitals</span>
              <span className="text-xs text-slate-400">{hospitals.reduce((s, h) => s + h.count, 0)} doctors</span>
            </button>
            {filtered.map((h) => (
              <button
                key={h.name}
                type="button"
                onClick={() => { onChange(h.name); setOpen(false); setQ(""); }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition hover:bg-slate-50 ${value === h.name ? "font-semibold text-emerald-700 bg-emerald-50" : "text-slate-700"}`}
              >
                <span className="truncate text-left flex-1">{h.name}</span>
                <span className="text-xs text-slate-400 ml-2 shrink-0">
                  {h.count} · {fmtNaira(h.revenue)}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No hospitals match</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Month picker dropdown
function MonthDropdown({
  months, value, onChange,
}: { months: string[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition whitespace-nowrap ${
          value ? "border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold" : "border-slate-200 bg-white text-slate-600"
        }`}
      >
        <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        <span>{value ? fmtMonth(value) : "All Time"}</span>
        {value && (
          <span role="button" onClick={(e) => { e.stopPropagation(); onChange(""); }} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden min-w-[160px]">
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition hover:bg-slate-50 ${!value ? "font-semibold text-emerald-700" : "text-slate-700"}`}
            >
              All Time
            </button>
            {months.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { onChange(m); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition hover:bg-slate-50 ${value === m ? "font-semibold text-emerald-700 bg-emerald-50" : "text-slate-700"}`}
              >
                {fmtMonth(m)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Doctor card — month-aware
function DoctorCard({ doctor, monthFilter }: { doctor: Doctor; monthFilter: string }) {
  const [expanded, setExpanded] = useState(false);

  // Filter requests to selected month
  const visibleRequests = useMemo(() => {
    if (!monthFilter) return doctor.requests;
    return doctor.requests.filter((r) => toYM(r.created_at) === monthFilter);
  }, [doctor.requests, monthFilter]);

  const incoming = visibleRequests.filter((r) => r.status === "incoming").length;
  const seen     = visibleRequests.filter((r) => r.status === "seen").length;
  const visited  = visibleRequests.filter((r) => isRevenue(r.status)).length;
  const revenue  = visibleRequests.filter((r) => isRevenue(r.status)).reduce((s, r) => s + r.lab_revenue_amount, 0);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-slate-50/60 transition"
      >
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-emerald-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800">{doctor.doctor_name}</p>
            {!doctor.claimed && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                <ShieldAlert className="w-3 h-3" />Unclaimed
              </span>
            )}
          </div>

          {/* All hospitals */}
          {doctor.hospitals.length > 0 && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
              {doctor.hospitals.map((h) => (
                <span key={h} className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Building2 className="w-3 h-3 text-slate-400 shrink-0" />{h}
                </span>
              ))}
            </div>
          )}

          {doctor.doctor_phone && (
            <div className="flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
              <a href={`tel:${doctor.doctor_phone}`} className="text-xs text-emerald-600 font-medium" onClick={(e) => e.stopPropagation()}>
                {doctor.doctor_phone}
              </a>
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-slate-500">{visibleRequests.length} request{visibleRequests.length !== 1 ? "s" : ""}</span>
            {visited > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle className="w-2.5 h-2.5" />{visited} visited
              </span>
            )}
            {incoming > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-2.5 h-2.5" />{incoming} pending
              </span>
            )}
            {seen > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <Eye className="w-2.5 h-2.5" />{seen} at lab
              </span>
            )}
            {revenue > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 font-mono">
                <Banknote className="w-3 h-3" />{fmtNaira(revenue)}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-slate-400 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/40">
          {visibleRequests.length === 0 ? (
            <div className="flex flex-col items-center py-4 gap-2">
              <TestTube2 className="w-8 h-8 text-slate-200" />
              <p className="text-xs text-slate-400">
                {monthFilter ? "No requests this month" : doctor.claimed ? "No requests yet" : "Doctor hasn't claimed their profile"}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Test Requests</p>
              {visibleRequests.map((req) => <RequestRow key={req.id} req={req} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── create professional modal ────────────────────────────────────────────────

function CreateProfessionalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail]       = useState("");
  const [prefix, setPrefix]     = useState("Dr.");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone]       = useState("");
  const [hospitals, setHospitals] = useState<string[]>([]);
  const [bankName, setBankName]   = useState("");
  const [bankCode, setBankCode]   = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim())    { setError("Email is required."); return; }
    if (!fullName.trim()) { setError("Full name is required."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/scale/professionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), prefix: prefix || null, full_name: fullName.trim(), phone: phone.trim() || null, hospitals, bank_name: bankName || null, account_number: accountNumber || null, account_name: accountName || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create."); return; }
      onCreated();
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">Add Professional</p>
            <p className="text-xs text-slate-400 mt-0.5">Create a profile for a medical professional you work with</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className={labelCls}>Email Address <span className="text-red-400">*</span></label>
              <input type="email" placeholder="doctor@clinic.com" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Title &amp; Full Name <span className="text-red-400">*</span></label>
              <PrefixSelect value={prefix} onChange={setPrefix} />
              <div className="mt-2">
                <input type="text" placeholder="Full name" value={fullName} onChange={(e) => { setFullName(e.target.value); setError(""); }} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Phone Number</label>
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
            <div>
              <label className={labelCls}>Hospital / Clinic</label>
              <HospitalTagInput value={hospitals} onChange={setHospitals} />
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bank Details</p>
              <p className="text-xs text-slate-400 mb-3">Doctor will confirm these when they claim their profile.</p>
              <BankAccountInput bankName={bankName} bankCode={bankCode} accountNumber={accountNumber} accountName={accountName}
                onBankChange={(name, code) => { setBankName(name); setBankCode(code); }}
                onAccountNumberChange={setAccountNumber} onAccountNameChange={setAccountName} />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
          </div>
          <div className="px-5 pb-5 pt-1 shrink-0 border-t border-slate-100">
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {loading ? "Creating..." : "Add Professional"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ScaleDashboardPage() {
  const router = useRouter();
  const [marketer, setMarketer]     = useState<Marketer | null>(null);
  const [doctors, setDoctors]       = useState<Doctor[]>([]);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [search, setSearch]         = useState("");
  const [hospitalFilter, setHospitalFilter] = useState("");
  const [monthFilter, setMonthFilter]       = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/scale/dashboard");
      if (res.status === 401) { router.replace("/scale"); return; }
      const data = await res.json();
      if (!data.success) { setError(data.error ?? "Failed to load."); return; }
      setMarketer(data.marketer);
      setDoctors(data.doctors);
      setStats(data.stats);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/scale/logout", { method: "POST" });
    router.replace("/scale");
  }

  // Derive all available months from requests (newest first)
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const d of doctors) {
      for (const r of d.requests) months.add(toYM(r.created_at));
    }
    return Array.from(months).sort().reverse();
  }, [doctors]);

  // Build hospital list with doctor counts + revenue
  const hospitalList = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const d of doctors) {
      const docRevenue = d.requests
        .filter((r) => isRevenue(r.status) && (!monthFilter || toYM(r.created_at) === monthFilter))
        .reduce((s, r) => s + r.lab_revenue_amount, 0);
      for (const h of d.hospitals) {
        const cur = map.get(h) ?? { count: 0, revenue: 0 };
        map.set(h, { count: cur.count + 1, revenue: cur.revenue + docRevenue });
      }
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  }, [doctors, monthFilter]);

  // Filter doctors by search, hospital, month
  const filteredDoctors = useMemo(() => {
    let result = doctors;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((d) =>
        d.doctor_name.toLowerCase().includes(q) ||
        d.doctor_email.toLowerCase().includes(q) ||
        d.hospitals.some((h) => h.toLowerCase().includes(q))
      );
    }
    if (hospitalFilter) {
      result = result.filter((d) => d.hospitals.includes(hospitalFilter));
    }
    if (monthFilter) {
      result = result.filter((d) => d.requests.some((r) => toYM(r.created_at) === monthFilter));
    }
    return result;
  }, [doctors, search, hospitalFilter, monthFilter]);

  // Compute filtered totals for summary
  const filteredRevenue = useMemo(() =>
    filteredDoctors.reduce((sum, d) => {
      const reqs = monthFilter ? d.requests.filter((r) => toYM(r.created_at) === monthFilter) : d.requests;
      return sum + reqs.filter((r) => isRevenue(r.status)).reduce((s, r) => s + r.lab_revenue_amount, 0);
    }, 0),
  [filteredDoctors, monthFilter]);

  const filteredVisited = useMemo(() =>
    filteredDoctors.reduce((sum, d) => {
      const reqs = monthFilter ? d.requests.filter((r) => toYM(r.created_at) === monthFilter) : d.requests;
      return sum + reqs.filter((r) => isRevenue(r.status)).length;
    }, 0),
  [filteredDoctors, monthFilter]);

  const isFiltered = !!(search || hospitalFilter || monthFilter);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-white/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 flex items-center justify-center shadow-sm shrink-0">
            <TrendingUp className="w-4 h-4 text-emerald-200" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight">{marketer?.name ?? "Marketer Portal"}</p>
            {marketer && <p className="text-xs text-slate-400 truncate">{marketer.email}</p>}
          </div>
          <button type="button" onClick={load} disabled={loading}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-500 shrink-0">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" onClick={handleLogout} disabled={loggingOut}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition text-slate-500 shrink-0">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Revenue summary + counts */}
        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <RevenueCard
                label={isFiltered ? "Filtered Revenue" : "Total Revenue"}
                value={fmtNaira(isFiltered ? filteredRevenue : stats.total_revenue)}
                sub={`${isFiltered ? filteredVisited : stats.done} patient visits`}
              />
              <RevenueCard
                label="Professionals"
                value={String(isFiltered ? filteredDoctors.length : stats.total_doctors)}
                sub={`${isFiltered ? "" : stats.total_requests + " total requests"}`}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total Requests" value={isFiltered
                ? filteredDoctors.reduce((s, d) => s + (monthFilter ? d.requests.filter((r) => toYM(r.created_at) === monthFilter).length : d.total_requests), 0)
                : stats.total_requests} color="text-slate-700" />
              <StatCard label="Visited" value={isFiltered ? filteredVisited : stats.done} color="text-emerald-700" />
              <StatCard label="Pending" value={isFiltered
                ? filteredDoctors.reduce((s, d) => s + (monthFilter ? d.requests.filter((r) => toYM(r.created_at) === monthFilter && r.status === "incoming").length : d.requests.filter((r) => r.status === "incoming").length), 0)
                : stats.pending} color="text-amber-600" />
            </div>
          </>
        )}

        {/* Add Professional */}
        <button type="button" onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-3 rounded-2xl transition shadow-sm">
          <Plus className="w-4 h-4" /> Add Professional
        </button>

        {error && <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

        {/* Filters */}
        {doctors.length > 0 && (
          <div className="space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input type="text" placeholder="Search by name, hospital, or email…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition" />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Hospital + Month dropdowns */}
            <div className="flex gap-2">
              <HospitalDropdown hospitals={hospitalList} value={hospitalFilter} onChange={setHospitalFilter} />
              {availableMonths.length > 0 && (
                <MonthDropdown months={availableMonths} value={monthFilter} onChange={setMonthFilter} />
              )}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !doctors.length && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-100 rounded w-2/3" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredDoctors.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">
              {isFiltered ? "No professionals match your filters" : "No professionals yet"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {isFiltered ? "Try adjusting your filters." : "Add the doctors you work with to start tracking."}
            </p>
            {!isFiltered && (
              <button type="button" onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition">
                <Plus className="w-3.5 h-3.5" /> Add first professional
              </button>
            )}
          </div>
        )}

        {/* Doctor cards */}
        <div className="space-y-3">
          {filteredDoctors.map((doctor) => (
            <DoctorCard key={doctor.doctor_email} doctor={doctor} monthFilter={monthFilter} />
          ))}
        </div>
      </main>

      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <PoveonLogo className="w-4 h-4 opacity-40" />
        <span>© {new Date().getFullYear()} Poveon. All rights reserved.</span>
      </div>

      {showCreate && (
        <CreateProfessionalModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
