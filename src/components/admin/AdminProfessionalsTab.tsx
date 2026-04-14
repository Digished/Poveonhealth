"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, X, User, Search, Loader2, CheckCircle, ShieldAlert,
  Building2, Phone, Trash2, RefreshCw, ChevronDown,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { PrefixSelect } from "@/components/PrefixSelect";
import { BankAccountInput } from "@/components/BankAccountInput";
import { PhoneInput } from "@/components/PhoneInput";
import { HospitalTagInput } from "@/components/ui/HospitalTagInput";
import { Button } from "@/components/ui/Button";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Professional {
  email: string;
  prefix: string | null;
  full_name: string | null;
  phone: string | null;
  hospitals: string[];
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  claimed: boolean;
  updated_at: string;
  marketer: { id: string; name: string; email: string } | null;
}

type EmailCheckResult = {
  exists: boolean;
  claimed: boolean;
  marketer: { id: string; name: string; email: string } | null;
  data?: { email: string; full_name: string | null; prefix: string | null; phone: string | null; hospitals: string[] };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Create Professional Modal ──────────────────────────────────────────────────

function CreateProfessionalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [subStep, setSubStep] = useState<"email" | "details">("email");

  // email step
  const [email, setEmail]       = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState<EmailCheckResult | null>(null);
  const checkRef = useRef<NodeJS.Timeout | null>(null);

  // details step
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

  // Debounced email check
  useEffect(() => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailResult(null); return;
    }
    if (checkRef.current) clearTimeout(checkRef.current);
    checkRef.current = setTimeout(async () => {
      setCheckingEmail(true);
      try {
        const res = await fetch(`/api/admin/professionals/check-email?email=${encodeURIComponent(trimmed)}`);
        if (res.ok) setEmailResult(await res.json());
      } catch { /* ignore */ } finally { setCheckingEmail(false); }
    }, 350);
    return () => { if (checkRef.current) clearTimeout(checkRef.current); };
  }, [email]);

  async function doSubmit(overrideName?: string) {
    const name = overrideName ?? fullName;
    if (!email.trim())  { setError("Email is required."); return; }
    if (!name.trim())   { setError("Full name is required."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/admin/professionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:          email.trim(),
          prefix:         overrideName ? (emailResult?.data?.prefix ?? null) : prefix,
          full_name:      name.trim(),
          phone:          overrideName ? (emailResult?.data?.phone ?? null) : phone.trim() || null,
          hospitals:      overrideName ? (emailResult?.data?.hospitals ?? []) : hospitals,
          bank_name:      bankName     || null,
          account_number: accountNumber || null,
          account_name:   accountName   || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to add."); return; }
      toast.success("Professional added!");
      onCreated();
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-white/15 bg-white/8 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition";
  const labelCls = "block text-xs font-medium text-slate-300 mb-1.5";

  // derived
  const isNew          = emailResult !== null && !emailResult.exists;
  const isExisting     = !!emailResult?.exists && !emailResult.claimed;
  const isClaimed      = !!emailResult?.exists && emailResult.claimed;
  const foundName      = emailResult?.data ? `${emailResult.data.prefix ?? ""} ${emailResult.data.full_name ?? ""}`.trim() : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-white/12 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {subStep === "details" && (
              <button
                type="button"
                onClick={() => { setSubStep("email"); setError(""); }}
                className="w-7 h-7 rounded-lg bg-white/8 hover:bg-white/15 flex items-center justify-center text-slate-400 transition shrink-0"
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
              </button>
            )}
            <div>
              <p className="text-sm font-bold text-white">Add Professional</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {subStep === "email" ? "Enter their email to get started" : "Fill in the professional's details"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/8 hover:bg-white/15 flex items-center justify-center text-slate-400 transition shrink-0 ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-5 pt-3 pb-1 shrink-0">
          {["Email", "Details"].map((label, i) => {
            const stepNum = i + 1;
            const currentNum = subStep === "email" ? 1 : 2;
            const done = stepNum < currentNum;
            const active = stepNum === currentNum;
            return (
              <div key={label} className="flex items-center">
                <div className="flex flex-col items-center gap-0.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    done ? "bg-emerald-600 text-white" : active ? "bg-white text-slate-900" : "bg-white/10 text-slate-500"
                  }`}>
                    {done ? <CheckCircle className="w-3 h-3" /> : stepNum}
                  </div>
                  <span className={`text-[10px] font-semibold ${active ? "text-slate-200" : "text-slate-500"}`}>{label}</span>
                </div>
                {i === 0 && (
                  <div className={`w-10 h-0.5 mx-1.5 mb-3 rounded transition-colors ${done ? "bg-emerald-500" : "bg-white/10"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── EMAIL STEP ── */}
        {subStep === "email" && (
          <div className="overflow-y-auto flex-1 flex flex-col">
            <div className="px-5 py-4 space-y-4 flex-1">
              <div>
                <label className={labelCls}>Email Address <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  placeholder="doctor@clinic.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); setEmailResult(null); }}
                  className={inputCls}
                  autoFocus
                />
                {checkingEmail && (
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking…
                  </p>
                )}
              </div>

              {/* New */}
              {isNew && !checkingEmail && (
                <div className="rounded-2xl border border-sky-700/50 bg-sky-900/20 px-4 py-3.5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-800/40 flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-sky-300">New professional</p>
                    <p className="text-xs text-sky-500 mt-0.5">No profile found. Continue to fill in their details.</p>
                  </div>
                </div>
              )}

              {/* Existing unclaimed */}
              {isExisting && !checkingEmail && (
                <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/15 px-4 py-3.5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-800/40 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{foundName || "Doctor"}</p>
                      <p className="text-xs text-slate-400">{email}</p>
                    </div>
                    <span className="text-[10px] bg-amber-900/40 text-amber-400 border border-amber-700/30 px-2 py-0.5 rounded-full font-semibold shrink-0">Unclaimed</span>
                  </div>
                  {emailResult?.data?.phone && (
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 pl-11">
                      <Phone className="w-3 h-3" />{emailResult.data.phone}
                    </p>
                  )}
                  {(emailResult?.data?.hospitals ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-11">
                      {emailResult!.data!.hospitals.map((h) => (
                        <span key={h} className="text-xs bg-white/8 border border-white/10 text-slate-300 px-2 py-0.5 rounded-full">{h}</span>
                      ))}
                    </div>
                  )}
                  {emailResult?.marketer && (
                    <p className="text-xs text-slate-400 pl-11">Linked to marketer: <span className="text-white font-semibold">{emailResult.marketer.name}</span></p>
                  )}
                  {!emailResult?.marketer && (
                    <p className="text-xs text-emerald-400 font-medium pl-11">Pre-created profile — tap below to update details.</p>
                  )}
                </div>
              )}

              {/* Claimed */}
              {isClaimed && !checkingEmail && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-700/30 flex items-center justify-center shrink-0">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{foundName || "Doctor"}</p>
                      <p className="text-xs text-slate-400">{email}</p>
                    </div>
                    <span className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-700/30 px-2 py-0.5 rounded-full font-semibold shrink-0">Verified</span>
                  </div>
                  <div className="flex items-center gap-2 pl-11">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-400 font-semibold">Active account — cannot be overwritten.</p>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2">{error}</p>
              )}
            </div>

            <div className="px-5 pb-5 pt-2 shrink-0 border-t border-white/8 space-y-2">
              {isNew && !checkingEmail && (
                <button
                  type="button"
                  onClick={() => setSubStep("details")}
                  className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm px-4 py-3 rounded-xl transition"
                >
                  Continue <ChevronDown className="w-4 h-4 -rotate-90" />
                </button>
              )}
              {isExisting && !checkingEmail && (
                <button
                  type="button"
                  onClick={() => setSubStep("details")}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
                >
                  <Plus className="w-4 h-4" /> Update Profile
                </button>
              )}
              {isClaimed && !checkingEmail && (
                <button disabled className="w-full flex items-center justify-center gap-2 bg-white/10 text-slate-500 font-semibold text-sm px-4 py-3 rounded-xl cursor-not-allowed">
                  Cannot modify active account
                </button>
              )}
              {!isNew && !isExisting && !isClaimed && (
                <button disabled className="w-full flex items-center justify-center gap-2 bg-emerald-600/30 text-white/40 font-semibold text-sm px-4 py-3 rounded-xl cursor-not-allowed">
                  {checkingEmail ? <><Loader2 className="w-4 h-4 animate-spin" />Checking…</> : "Enter an email to continue"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── DETAILS STEP ── */}
        {subStep === "details" && (
          <form onSubmit={(e) => { e.preventDefault(); doSubmit(); }} className="overflow-y-auto flex-1 flex flex-col">
            <div className="px-5 py-4 space-y-4 flex-1">
              {/* Email reminder */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className="text-xs text-slate-400 flex-1 truncate">{email}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${isExisting ? "bg-amber-900/30 text-amber-400" : "bg-sky-900/30 text-sky-400"}`}>
                  {isExisting ? "Existing" : "New"}
                </span>
              </div>

              {/* Prefix + Name */}
              <div>
                <label className={labelCls}>Title &amp; Full Name <span className="text-red-400">*</span></label>
                <PrefixSelect value={prefix} onChange={setPrefix} />
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Full name"
                    value={fullName || (emailResult?.data?.full_name ?? "")}
                    onChange={(e) => { setFullName(e.target.value); setError(""); }}
                    className={inputCls}
                    autoFocus
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className={labelCls}>Phone Number</label>
                <PhoneInput value={phone || (emailResult?.data?.phone ?? "")} onChange={setPhone} />
              </div>

              {/* Hospital */}
              <div>
                <label className={labelCls}>Hospital / Clinic</label>
                <HospitalTagInput
                  value={hospitals.length > 0 ? hospitals : (emailResult?.data?.hospitals ?? [])}
                  onChange={setHospitals}
                />
              </div>

              {/* Bank details */}
              <div className="rounded-2xl border border-white/8 bg-white/3 p-3.5 space-y-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Bank Details <span className="text-slate-600 font-normal normal-case tracking-normal">(optional)</span></p>
                <BankAccountInput
                  bankName={bankName} bankCode={bankCode}
                  accountNumber={accountNumber} accountName={accountName}
                  onBankChange={(name, code) => { setBankName(name); setBankCode(code); }}
                  onAccountNumberChange={setAccountNumber}
                  onAccountNameChange={setAccountName}
                  optional
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-xl px-3 py-2">{error}</p>
              )}
            </div>

            <div className="px-5 pb-5 pt-2 shrink-0 border-t border-white/8">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {loading ? "Saving..." : isExisting ? "Update Professional" : "Add Professional"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main Tab Component ─────────────────────────────────────────────────────────

export function AdminProfessionalsTab() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Professional | null>(null);

  const fetchProfessionals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/professionals");
      const data = await res.json();
      if (data.success) setProfessionals(data.professionals ?? []);
      else toast.error(data.error ?? "Failed to load professionals");
    } catch { toast.error("Network error"); }
    finally { setLoading(false); }
  }, []);

  // Load on mount
  useEffect(() => { fetchProfessionals(); }, [fetchProfessionals]);

  async function handleDelete(pro: Professional) {
    setDeletingEmail(pro.email);
    try {
      const res = await fetch(`/api/admin/professionals/${encodeURIComponent(pro.email)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setProfessionals((prev) => prev.filter((p) => p.email !== pro.email));
        toast.success("Profile deleted");
      } else {
        toast.error(data.error ?? "Failed to delete");
      }
    } catch { toast.error("Network error"); }
    finally { setDeletingEmail(null); setConfirmDelete(null); }
  }

  const filtered = professionals.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.email.includes(q) ||
      (p.full_name ?? "").toLowerCase().includes(q) ||
      p.hospitals.some((h) => h.toLowerCase().includes(q)) ||
      (p.marketer?.name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-white">
          Professionals <span className="text-slate-500 font-normal text-sm">({professionals.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchProfessionals}
            disabled={loading}
            className="p-2 rounded-lg bg-white/8 border border-white/10 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Professional</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, hospital, marketer…"
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-slate-500 hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* List */}
      {loading && professionals.length === 0 ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl h-20 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <User className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-400">
            {search ? "No professionals match your search" : "No professionals yet"}
          </p>
          {!search && (
            <p className="text-xs text-slate-500 mt-1">Add a doctor profile to get started.</p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border border-white/8 divide-y divide-white/5">
          {filtered.map((pro) => {
            const displayName = [pro.prefix, pro.full_name].filter(Boolean).join(" ") || pro.email;
            return (
              <div key={pro.email} className="flex items-center gap-3 px-4 py-3.5 bg-white/3 hover:bg-white/5 transition-colors">
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  pro.claimed ? "bg-emerald-700/30" : "bg-amber-700/20"
                }`}>
                  {pro.claimed
                    ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                    : <User className="w-4 h-4 text-amber-400" />
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate leading-tight">{displayName}</p>
                    {pro.claimed
                      ? <span className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/30 px-1.5 py-0.5 rounded-full shrink-0">Verified</span>
                      : <span className="text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800/20 px-1.5 py-0.5 rounded-full shrink-0">Unclaimed</span>
                    }
                  </div>
                  <p className="text-xs text-slate-500 truncate">{pro.email}</p>
                  {pro.hospitals.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="text-xs text-slate-500 truncate">{pro.hospitals.join(", ")}</span>
                    </div>
                  )}
                  {pro.marketer && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Marketer: <span className="text-slate-300 font-medium">{pro.marketer.name}</span>
                    </p>
                  )}
                </div>

                {/* Updated */}
                <div className="shrink-0 text-right hidden sm:block">
                  <p className="text-[10px] text-slate-600">{fmt(pro.updated_at)}</p>
                </div>

                {/* Delete */}
                {!pro.claimed && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(pro)}
                    disabled={deletingEmail === pro.email}
                    title="Delete profile"
                    className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40 shrink-0"
                  >
                    {deletingEmail === pro.email
                      ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateProfessionalModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchProfessionals(); }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="font-semibold text-white mb-1">Delete profile?</h3>
              <p className="text-sm text-slate-400">
                Remove <span className="text-white font-medium">{confirmDelete.full_name ?? confirmDelete.email}</span>?
                This also removes any marketer link.
              </p>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="secondary" fullWidth onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button
                type="button"
                fullWidth
                loading={deletingEmail === confirmDelete.email}
                onClick={() => handleDelete(confirmDelete)}
                className="bg-red-600 hover:bg-red-700"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
