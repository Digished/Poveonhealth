"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp, LogOut, RefreshCw, User, Building2,
  Phone, TestTube2, ChevronDown, ChevronUp,
  Clock, CheckCircle, Eye, Plus, X, Loader2,
  ShieldAlert,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { PrefixSelectInput } from "@/components/ui/PrefixSelectInput";
import { BankAccountInput } from "@/components/BankAccountInput";

interface Marketer {
  name: string;
  email: string;
}

interface RequestSummary {
  id: string;
  code: string;
  patient_name: string;
  tests: string;
  status: string;
  created_at: string;
  seen_at: string | null;
  completed_at: string | null;
}

interface Doctor {
  doctor_email: string;
  doctor_name: string;
  doctor_phone: string | null;
  doctor_hospital: string | null;
  specialty: string | null;
  claimed: boolean;
  total_requests: number;
  linked_since: string;
  requests: RequestSummary[];
}

interface Stats {
  total_doctors: number;
  total_requests: number;
  pending: number;
  seen: number;
  done: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  incoming: {
    label: "Pending",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <Clock className="w-3 h-3" />,
  },
  seen: {
    label: "Patient Arrived",
    color: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: <Eye className="w-3 h-3" />,
  },
  done: {
    label: "Completed",
    color: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <CheckCircle className="w-3 h-3" />,
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
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
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Patient: <span className="font-semibold text-slate-700">{req.patient_name}</span>
        </p>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed line-clamp-2">{req.tests}</p>
      </div>
      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0 mt-0.5">{formatDate(req.created_at)}</span>
    </div>
  );
}

function DoctorCard({ doctor }: { doctor: Doctor }) {
  const [expanded, setExpanded] = useState(false);

  const incoming = doctor.requests.filter((r) => r.status === "incoming").length;
  const seen     = doctor.requests.filter((r) => r.status === "seen").length;
  const done     = doctor.requests.filter((r) => r.status === "done").length;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-slate-50/60 transition"
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-emerald-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800 truncate">{doctor.doctor_name}</p>
            {!doctor.claimed && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
                <ShieldAlert className="w-3 h-3" />Pending claim
              </span>
            )}
          </div>
          {doctor.specialty && (
            <p className="text-xs text-medical-600 font-medium mt-0.5">{doctor.specialty}</p>
          )}
          {doctor.doctor_hospital && (
            <div className="flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500 truncate">{doctor.doctor_hospital}</span>
            </div>
          )}
          {doctor.doctor_phone && (
            <div className="flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
              <a
                href={`tel:${doctor.doctor_phone}`}
                className="text-xs text-emerald-600 font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                {doctor.doctor_phone}
              </a>
            </div>
          )}
          {/* Mini status chips */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500">
              {doctor.total_requests} request{doctor.total_requests !== 1 ? "s" : ""}
            </span>
            {incoming > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-2.5 h-2.5" />{incoming}
              </span>
            )}
            {seen > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                <Eye className="w-2.5 h-2.5" />{seen}
              </span>
            )}
            {done > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle className="w-2.5 h-2.5" />{done}
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
          {doctor.requests.length === 0 ? (
            <div className="flex flex-col items-center py-4 gap-2">
              <TestTube2 className="w-8 h-8 text-slate-200" />
              <p className="text-xs text-slate-400">
                {doctor.claimed ? "No requests submitted yet" : "Doctor has not yet claimed their profile"}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Test Requests
              </p>
              {doctor.requests.map((req) => (
                <RequestRow key={req.id} req={req} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateProfessionalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email,       setEmail]       = useState("");
  const [prefix,      setPrefix]      = useState("Dr.");
  const [fullName,    setFullName]    = useState("");
  const [specialty,   setSpecialty]   = useState("");
  const [phone,       setPhone]       = useState("");
  const [hospital,    setHospital]    = useState("");
  // Bank fields — bankCode used only for Paystack verification, not stored
  const [bankName,      setBankName]      = useState("");
  const [bankCode,      setBankCode]      = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName,   setAccountName]   = useState("");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim())    { setError("Email is required."); return; }
    if (!fullName.trim()) { setError("Full name is required."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/scale/professionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:          email.trim(),
          prefix:         prefix          || null,
          full_name:      fullName.trim(),
          specialty:      specialty.trim()       || null,
          phone:          phone.trim()           || null,
          hospitals:      hospital.trim() ? [hospital.trim()] : [],
          bank_name:      bankName               || null,
          account_number: accountNumber          || null,
          account_name:   accountName            || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create."); return; }
      onCreated();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">Add Professional</p>
            <p className="text-xs text-slate-400 mt-0.5">Create a profile for a medical professional you work with</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-5 py-4 space-y-4">

            {/* Email */}
            <div>
              <label className={labelCls}>Email Address <span className="text-red-400">*</span></label>
              <input type="email" placeholder="doctor@clinic.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }} className={inputCls} />
            </div>

            {/* Title + Name */}
            <div>
              <label className={labelCls}>Title &amp; Full Name <span className="text-red-400">*</span></label>
              <div className="flex gap-2">
                <PrefixSelectInput value={prefix} onChange={setPrefix} />
                <input type="text" placeholder="Full name" value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setError(""); }}
                  className={`${inputCls} flex-1`} />
              </div>
            </div>

            {/* Specialty */}
            <div>
              <label className={labelCls}>Specialty</label>
              <input type="text" placeholder="e.g. Cardiologist, General Practitioner" value={specialty}
                onChange={(e) => setSpecialty(e.target.value)} className={inputCls} />
            </div>

            {/* Phone */}
            <div>
              <label className={labelCls}>Phone Number</label>
              <input type="tel" placeholder="+234 800 123 4567" value={phone}
                onChange={(e) => setPhone(e.target.value)} className={inputCls} />
            </div>

            {/* Hospital */}
            <div>
              <label className={labelCls}>Hospital / Clinic</label>
              <input type="text" placeholder="Hospital or clinic name" value={hospital}
                onChange={(e) => setHospital(e.target.value)} className={inputCls} />
            </div>

            {/* Bank details — with full NUBAN verification */}
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bank Details</p>
              <p className="text-xs text-slate-400 mb-3">Doctor will confirm these when they claim their profile.</p>
              <BankAccountInput
                bankName={bankName}
                bankCode={bankCode}
                accountNumber={accountNumber}
                accountName={accountName}
                onBankChange={(name, code) => { setBankName(name); setBankCode(code); }}
                onAccountNumberChange={setAccountNumber}
                onAccountNameChange={setAccountName}
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
            )}
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

export default function ScaleDashboardPage() {
  const router = useRouter();
  const [marketer, setMarketer]       = useState<Marketer | null>(null);
  const [doctors, setDoctors]         = useState<Doctor[]>([]);
  const [stats, setStats]             = useState<Stats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [loggingOut, setLoggingOut]   = useState(false);
  const [search, setSearch]           = useState("");
  const [showCreate, setShowCreate]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/scale/dashboard");
      if (res.status === 401) { router.replace("/scale"); return; }
      const data = await res.json();
      if (!data.success) { setError(data.error ?? "Failed to load."); return; }
      setMarketer(data.marketer);
      setDoctors(data.doctors);
      setStats(data.stats);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/scale/logout", { method: "POST" });
    router.replace("/scale");
  }

  const filteredDoctors = search.trim()
    ? doctors.filter(
        (d) =>
          d.doctor_name.toLowerCase().includes(search.toLowerCase()) ||
          d.doctor_hospital?.toLowerCase().includes(search.toLowerCase()) ||
          d.specialty?.toLowerCase().includes(search.toLowerCase()) ||
          d.doctor_email.toLowerCase().includes(search.toLowerCase())
      )
    : doctors;

  return (
    <div className="min-h-dvh bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-white/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 flex items-center justify-center shadow-sm shrink-0">
            <TrendingUp className="w-4 h-4 text-emerald-200" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight">
              {marketer?.name ?? "Marketer Portal"}
            </p>
            {marketer && (
              <p className="text-xs text-slate-400 truncate">{marketer.email}</p>
            )}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-500 shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition text-slate-500 shrink-0"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Professionals" value={stats.total_doctors}  color="text-emerald-600" />
            <StatCard label="Total Requests" value={stats.total_requests} color="text-slate-700" />
            <StatCard label="Pending"        value={stats.pending}        color="text-amber-600" />
            <StatCard label="Completed"      value={stats.done}           color="text-emerald-600" />
          </div>
        )}

        {/* Add Professional button */}
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-3 rounded-2xl transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Professional
        </button>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* Search */}
        {doctors.length > 3 && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name, specialty, or hospital..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
            />
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
              {search ? "No professionals match your search" : "No professionals yet"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {search
                ? "Try a different search term."
                : "Add the doctors you work with. They'll be able to claim their profile when they log in."}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
              >
                <Plus className="w-3.5 h-3.5" />Add first professional
              </button>
            )}
          </div>
        )}

        {/* Doctor cards */}
        <div className="space-y-3">
          {filteredDoctors.map((doctor) => (
            <DoctorCard key={doctor.doctor_email} doctor={doctor} />
          ))}
        </div>
      </main>

      {/* Footer */}
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <PoveonLogo className="w-4 h-4 opacity-40" />
        <span>© {new Date().getFullYear()} Poveon. All rights reserved.</span>
      </div>

      {/* Create Professional Modal */}
      {showCreate && (
        <CreateProfessionalModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
