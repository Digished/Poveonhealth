"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, X, User, Search, Loader2, CheckCircle, ShieldAlert,
  Building2, Phone, Trash2, RefreshCw, ChevronDown, Pencil,
  Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Download,
  ChevronUp, ChevronsUpDown, Copy, BanknoteIcon,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { PrefixSelect } from "@/components/PrefixSelect";
import { BankAccountInput } from "@/components/BankAccountInput";
import { PhoneInput } from "@/components/PhoneInput";
import { HospitalTagInput } from "@/components/ui/HospitalTagInput";
import { Button } from "@/components/ui/Button";
import { AdminOverlay } from "@/components/admin/AdminOverlay";

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
    <AdminOverlay onClose={onClose}>
      <div className="bg-slate-900 border border-white/12 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-modal">

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
    </AdminOverlay>
  );
}

// ── Edit Professional Modal ────────────────────────────────────────────────────

function EditProfessionalModal({
  professional,
  onClose,
  onSaved,
}: {
  professional: Professional;
  onClose: () => void;
  onSaved: (updated: Professional) => void;
}) {
  const [prefix, setPrefix]   = useState(professional.prefix ?? "Dr.");
  const [fullName, setFullName] = useState(professional.full_name ?? "");
  const [phone, setPhone]     = useState(professional.phone ?? "");
  const [hospitals, setHospitals] = useState<string[]>(professional.hospitals);
  const [bankName, setBankName]   = useState(professional.bank_name ?? "");
  const [bankCode, setBankCode]   = useState("");
  const [accountNumber, setAccountNumber] = useState(professional.account_number ?? "");
  const [accountName, setAccountName]     = useState(professional.account_name ?? "");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const claimed = professional.claimed;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) { setError("Full name is required."); return; }
    setError(""); setSaving(true);
    try {
      const res = await fetch("/api/admin/professionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:          professional.email,
          prefix:         prefix || null,
          full_name:      fullName.trim(),
          phone:          phone.trim() || null,
          hospitals,
          bank_name:      bankName     || null,
          account_number: accountNumber || null,
          account_name:   accountName   || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
      toast.success("Profile updated");
      onSaved({
        ...professional,
        prefix:         prefix || null,
        full_name:      fullName.trim(),
        phone:          phone.trim() || null,
        hospitals,
        bank_name:      bankName || null,
        account_number: accountNumber || null,
        account_name:   accountName || null,
      });
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-white/15 bg-white/8 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition";
  const labelCls = "block text-xs font-medium text-slate-300 mb-1.5";

  return (
    <AdminOverlay onClose={() => onClose()}>
      <div
        className="bg-slate-900 border border-white/12 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Edit Professional</p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{professional.email}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${claimed ? "bg-emerald-900/40 text-emerald-400 border border-emerald-700/30" : "bg-amber-900/30 text-amber-400 border border-amber-700/30"}`}>
              {claimed ? "Verified" : "Unclaimed"}
            </span>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/8 hover:bg-white/15 flex items-center justify-center text-slate-400 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {claimed ? (
          /* Read-only view for claimed (doctor-managed) profiles */
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-amber-700/30 bg-amber-900/15 p-4">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Active account</p>
                <p className="text-xs text-amber-500 mt-0.5">This doctor has signed in and manages their own profile. Fields are read-only.</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Full Name", value: `${professional.prefix ?? ""} ${professional.full_name ?? ""}`.trim() },
                { label: "Phone",     value: professional.phone ?? "—" },
                { label: "Hospitals", value: professional.hospitals.join(", ") || "—" },
                { label: "Bank",      value: professional.bank_name ? `${professional.bank_name} · ${professional.account_number}` : "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
                  <p className="text-sm text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Editable form for unclaimed profiles */
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 flex flex-col">
            <div className="px-5 py-4 space-y-4 flex-1">

              {/* Title + Name */}
              <div>
                <label className={labelCls}>Title &amp; Full Name <span className="text-red-400">*</span></label>
                <PrefixSelect value={prefix} onChange={setPrefix} />
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setError(""); }}
                    className={inputCls}
                    autoFocus
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className={labelCls}>Phone Number</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>

              {/* Hospitals */}
              <div>
                <label className={labelCls}>Hospital / Clinic</label>
                <HospitalTagInput value={hospitals} onChange={setHospitals} />
              </div>

              {/* Bank */}
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
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </AdminOverlay>
  );
}

// ── CSV Import Modal ───────────────────────────────────────────────────────────

const VALID_PREFIXES = new Set(["Dr.", "Prof.", "Nurse", "Pharm.", "CHEW", "CHO", "PT", "OT", "Optom.", "MW", "HO", "MO", "RN", "DVM"]);

const CSV_TEMPLATE = `email,prefix,full_name,phone,hospitals,bank_name,account_number,account_name
dr.james@clinic.com,Dr.,James Okonkwo,08012345678,LUTH|Lagos Island General Hospital,First Bank,1234567890,DR JAMES OKONKWO
nurse.ada@hospital.ng,Nurse,Ada Emeka,09087654321,Unity Clinic,,,
`;

interface CsvRow {
  email: string;
  prefix: string;
  full_name: string;
  phone: string;
  hospitals: string[];
  bank_name: string;
  account_number: string;
  account_name: string;
  _valid: boolean;
  _error?: string;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSVText(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, ""));
  const col = (name: string, aliases: string[] = []) => {
    const idx = [name, ...aliases].map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;
    return (cols: string[]) => cols[idx]?.trim() ?? "";
  };
  const getEmail    = col("email");
  const getPrefix   = col("prefix", ["title"]);
  const getName     = col("full_name", ["name", "full_name"]);
  const getPhone    = col("phone", ["phone_number", "mobile"]);
  const getHospital = col("hospitals", ["hospital", "clinic"]);
  const getBankName = col("bank_name", ["bank"]);
  const getAcctNo   = col("account_number", ["account_no", "acct_number"]);
  const getAcctName = col("account_name", ["acct_name"]);

  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const email    = getEmail(cols).toLowerCase();
    const full_name = getName(cols);
    const prefix   = getPrefix(cols);

    const row: CsvRow = {
      email,
      prefix,
      full_name,
      phone:          getPhone(cols),
      hospitals:      getHospital(cols).split("|").map((h) => h.trim()).filter(Boolean),
      bank_name:      getBankName(cols),
      account_number: getAcctNo(cols),
      account_name:   getAcctName(cols),
      _valid: true,
    };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      row._valid = false; row._error = "Invalid or missing email";
    } else if (!full_name) {
      row._valid = false; row._error = "Full name required";
    } else if (prefix && !VALID_PREFIXES.has(prefix)) {
      row._valid = false; row._error = `Unknown prefix "${prefix}"`;
    }

    return row;
  }).filter((r) => r.email || r.full_name); // drop completely blank rows
}

type ImportResult = {
  created: number;
  hospitals_created: number;
  skipped_claimed: number;
  skipped_duplicate: number;
  errors: { row: number; email: string; reason: string }[];
};

function CsvImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [rows, setRows]         = useState<CsvRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(parseCSVText(text));
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "professionals_template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport() {
    if (!rows) return;
    const valid = rows.filter((r) => r._valid);
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/admin/professionals/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: valid }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Import failed"); return; }
      setResult(data);
      if (data.created > 0) onImported();
    } catch { toast.error("Network error"); }
    finally { setImporting(false); }
  }

  const validRows   = rows?.filter((r) => r._valid) ?? [];
  const invalidRows = rows?.filter((r) => !r._valid) ?? [];

  return (
    <AdminOverlay onClose={() => onClose()} align="center">
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-modal flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Import from CSV / Spreadsheet</h2>
              {fileName && <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{fileName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Results screen */}
          {result ? (
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-emerald-900/30 border border-emerald-800/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-black text-emerald-400">{result.created}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Professionals added</p>
                </div>
                <div className="bg-teal-900/30 border border-teal-800/30 rounded-xl p-4 text-center">
                  <p className="text-2xl font-black text-teal-400">{result.hospitals_created ?? 0}</p>
                  <p className="text-xs text-teal-600 mt-0.5">Hospitals added</p>
                </div>
                <div className="bg-amber-900/20 border border-amber-800/20 rounded-xl p-4 text-center">
                  <p className="text-2xl font-black text-amber-400">{result.skipped_duplicate}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Duplicates skipped</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                  <p className="text-2xl font-black text-slate-300">{result.skipped_claimed}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Active accounts skipped</p>
                </div>
                <div className="bg-red-900/20 border border-red-800/20 rounded-xl p-4 text-center">
                  <p className="text-2xl font-black text-red-400">{result.errors.length}</p>
                  <p className="text-xs text-red-600 mt-0.5">Errors</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <div className="px-4 py-2 bg-white/5 border-b border-white/8">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Skipped / Errors</p>
                  </div>
                  <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-300 truncate">{e.email || `Row ${e.row}`}</p>
                          <p className="text-xs text-slate-500">{e.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-white/8 hover:bg-white/12 text-sm text-white font-medium transition-colors border border-white/10">
                Close
              </button>
            </div>
          ) : rows === null ? (
            /* Drop zone */
            <div className="p-6 space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center py-12 gap-3 ${
                  dragOver ? "border-violet-500 bg-violet-600/10" : "border-white/15 hover:border-white/25 bg-white/3"
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-white/8 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Drop your CSV here</p>
                  <p className="text-xs text-slate-500 mt-1">or click to browse — CSV or TSV files</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {/* Column spec */}
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <div className="px-4 py-2.5 bg-white/5 border-b border-white/8 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Expected column headers</p>
                  <button onClick={downloadTemplate}
                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors">
                    <Download className="w-3 h-3" />Download template
                  </button>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { col: "email",          note: "Required · Primary key",    req: true },
                      { col: "full_name",      note: "Required · Doctor's full name", req: true },
                      { col: "prefix",         note: "Optional · Dr., Nurse, Pharm., etc.", req: false },
                      { col: "phone",          note: "Optional · e.g. 08012345678", req: false },
                      { col: "hospitals",      note: "Optional · Pipe-separated: LUTH|Clinic A", req: false },
                      { col: "bank_name",      note: "Optional (bank group)",     req: false },
                      { col: "account_number", note: "Optional (bank group)",     req: false },
                      { col: "account_name",   note: "Optional (bank group)",     req: false },
                    ].map(({ col, note, req }) => (
                      <div key={col} className="flex items-start gap-2">
                        <code className={`text-xs px-1.5 py-0.5 rounded font-mono shrink-0 ${req ? "bg-violet-900/40 text-violet-300" : "bg-white/8 text-slate-400"}`}>{col}</code>
                        <span className="text-xs text-slate-500 leading-tight">{note}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 mt-3 border-t border-white/5 pt-3">
                    Bank details are all-or-nothing — provide all three or leave all blank. Account name will be stored as-is (no live NIBSS verification on bulk import).
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Preview */
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400 font-medium">{validRows.length} ready to import</span>
                </div>
                {invalidRows.length > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-400 font-medium">{invalidRows.length} with errors (will be skipped)</span>
                  </div>
                )}
                <button onClick={() => { setRows(null); setFileName(""); }}
                  className="ml-auto text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors">
                  Change file
                </button>
              </div>

              {/* Table */}
              <div className="rounded-xl border border-white/8 overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white/5 border-b border-white/8">
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap w-6">#</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap">Email</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap">Name</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap">Prefix</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap">Phone</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap">Hospitals</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap">Bank</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-semibold whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {rows.map((row, i) => (
                        <tr key={i} className={`transition-colors ${row._valid ? "hover:bg-white/3" : "bg-red-900/10"}`}>
                          <td className="px-3 py-2 text-slate-600">{i + 2}</td>
                          <td className="px-3 py-2 text-slate-300 font-mono max-w-[160px] truncate">{row.email || "—"}</td>
                          <td className="px-3 py-2 text-white max-w-[140px] truncate">{row.full_name || "—"}</td>
                          <td className="px-3 py-2 text-slate-400">{row.prefix || "—"}</td>
                          <td className="px-3 py-2 text-slate-400 font-mono">{row.phone || "—"}</td>
                          <td className="px-3 py-2 text-slate-400 max-w-[140px] truncate">{row.hospitals.join(", ") || "—"}</td>
                          <td className="px-3 py-2">
                            {row.bank_name ? (
                              <span className="text-emerald-400 font-medium">✓</span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row._valid ? (
                              <span className="text-emerald-400">Ready</span>
                            ) : (
                              <span className="text-red-400" title={row._error}>{row._error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {rows !== null && !result && (
          <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
            <p className="text-xs text-slate-500">
              Existing emails are skipped automatically. Active accounts are never modified.
            </p>
            <button
              onClick={doImport}
              disabled={importing || validRows.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors shrink-0"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? "Importing…" : `Import ${validRows.length} profile${validRows.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
    </AdminOverlay>
  );
}

// ── Main Tab Component ─────────────────────────────────────────────────────────

export function AdminProfessionalsTab() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Professional | null>(null);
  const [editProfessional, setEditProfessional] = useState<Professional | null>(null);
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "updated_at", dir: "desc" });
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [allMarketers, setAllMarketers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [marketerPopover, setMarketerPopover] = useState<string | null>(null); // email of row whose popover is open
  const [assigningMarketer, setAssigningMarketer] = useState<string | null>(null); // email being saved
  const marketerPopoverRef = useRef<HTMLDivElement>(null);

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

  // Fetch marketer list once
  useEffect(() => {
    fetch("/api/admin/create-marketer")
      .then((r) => r.json())
      .then((d) => { if (d.success) setAllMarketers(d.marketers ?? []); })
      .catch(() => {});
  }, []);

  // Close marketer popover on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (marketerPopoverRef.current && !marketerPopoverRef.current.contains(e.target as Node)) {
        setMarketerPopover(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function assignMarketer(doctorEmail: string, marketerId: string | null) {
    setAssigningMarketer(doctorEmail);
    setMarketerPopover(null);
    try {
      const url = `/api/admin/professionals/${encodeURIComponent(doctorEmail)}/marketer`;
      const res = await fetch(url, {
        method: marketerId ? "PATCH" : "DELETE",
        headers: marketerId ? { "Content-Type": "application/json" } : undefined,
        body: marketerId ? JSON.stringify({ marketer_id: marketerId }) : undefined,
      });
      const d = await res.json();
      if (d.success) {
        const mkt = allMarketers.find((m) => m.id === marketerId) ?? null;
        setProfessionals((prev) =>
          prev.map((p) =>
            p.email === doctorEmail
              ? { ...p, marketer: mkt ? { id: mkt.id, name: mkt.name, email: mkt.email } : null }
              : p
          )
        );
        toast.success(marketerId ? `Assigned to ${d.marketer_name ?? "marketer"}` : "Marketer removed");
      } else {
        toast.error(d.error ?? "Failed to update marketer");
      }
    } catch { toast.error("Network error"); }
    finally { setAssigningMarketer(null); }
  }

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

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.col === "email")      return dir * a.email.localeCompare(b.email);
    if (sort.col === "full_name")  return dir * ((a.full_name ?? "").localeCompare(b.full_name ?? ""));
    if (sort.col === "phone")      return dir * ((a.phone ?? "").localeCompare(b.phone ?? ""));
    if (sort.col === "hospitals")  return dir * (a.hospitals.join("").localeCompare(b.hospitals.join("")));
    if (sort.col === "marketer")   return dir * ((a.marketer?.name ?? "").localeCompare(b.marketer?.name ?? ""));
    if (sort.col === "claimed")    return dir * (Number(a.claimed) - Number(b.claimed));
    // updated_at default
    return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
  });

  function toggleSort(col: string) {
    setSort((prev) => prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  function copyEmail(email: string) {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 1500);
    }).catch(() => {});
  }

  function SortIcon({ col }: { col: string }) {
    if (sort.col !== col) return <ChevronsUpDown className="w-3 h-3 text-slate-600" />;
    return sort.dir === "asc"
      ? <ChevronUp className="w-3 h-3 text-slate-300" />
      : <ChevronDown className="w-3 h-3 text-slate-300" />;
  }

  const COL_HDR = "px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap select-none border-r border-white/5 last:border-r-0";
  const COL_HDR_BTN = `${COL_HDR} cursor-pointer hover:text-slate-300 hover:bg-white/4 transition-colors`;

  return (
    <div className="animate-fade-in space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-white">
          Professionals{" "}
          <span className="text-slate-500 font-normal text-sm">
            {search ? `${sorted.length} of ${professionals.length}` : professionals.length}
          </span>
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
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-400 hover:bg-violet-600/30 hover:text-violet-300 text-sm font-medium transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload CSV</span>
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

      {/* Spreadsheet table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 860 }}>
            {/* Sticky header */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800 border-b border-white/10">
                {/* Row number */}
                <th className={`${COL_HDR} w-10 text-center`}>#</th>
                <th className={COL_HDR_BTN} onClick={() => toggleSort("claimed")}>
                  <div className="flex items-center gap-1">Status <SortIcon col="claimed" /></div>
                </th>
                <th className={COL_HDR_BTN} onClick={() => toggleSort("email")}>
                  <div className="flex items-center gap-1">Email <SortIcon col="email" /></div>
                </th>
                <th className={COL_HDR_BTN} onClick={() => toggleSort("full_name")}>
                  <div className="flex items-center gap-1">Name <SortIcon col="full_name" /></div>
                </th>
                <th className={COL_HDR_BTN} onClick={() => toggleSort("phone")}>
                  <div className="flex items-center gap-1">Phone <SortIcon col="phone" /></div>
                </th>
                <th className={COL_HDR_BTN} onClick={() => toggleSort("hospitals")}>
                  <div className="flex items-center gap-1">Hospitals <SortIcon col="hospitals" /></div>
                </th>
                <th className={COL_HDR}>Bank</th>
                <th className={COL_HDR_BTN} onClick={() => toggleSort("marketer")}>
                  <div className="flex items-center gap-1">Marketer <SortIcon col="marketer" /></div>
                </th>
                <th className={COL_HDR_BTN} onClick={() => toggleSort("updated_at")}>
                  <div className="flex items-center gap-1">Updated <SortIcon col="updated_at" /></div>
                </th>
                <th className={`${COL_HDR} w-16 text-center`}></th>
              </tr>
            </thead>
            <tbody>
              {loading && professionals.length === 0 ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-white/5 animate-pulse">
                    {[...Array(10)].map((__, j) => (
                      <td key={j} className="px-3 py-2.5 border-r border-white/5 last:border-r-0">
                        <div className="h-3 bg-white/8 rounded" style={{ width: j === 0 ? 20 : j === 1 ? 48 : "80%" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <User className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">
                      {search ? "No professionals match your search" : "No professionals yet"}
                    </p>
                  </td>
                </tr>
              ) : (
                sorted.map((pro, i) => {
                  const displayName = [pro.prefix, pro.full_name].filter(Boolean).join(" ");
                  const hasBank = !!(pro.bank_name && pro.account_number);
                  return (
                    <tr
                      key={pro.email}
                      className={`group border-b border-white/5 last:border-b-0 transition-colors hover:bg-white/[0.04] ${
                        i % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent"
                      }`}
                    >
                      {/* Row # */}
                      <td className="px-3 py-2.5 text-center text-slate-600 border-r border-white/5 font-mono">{i + 1}</td>

                      {/* Status */}
                      <td className="px-3 py-2.5 border-r border-white/5 whitespace-nowrap">
                        {pro.claimed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/30 px-2 py-0.5 rounded-full font-semibold">
                            <CheckCircle className="w-2.5 h-2.5" />Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800/20 px-2 py-0.5 rounded-full font-semibold">
                            <User className="w-2.5 h-2.5" />Unclaimed
                          </span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="px-3 py-2.5 border-r border-white/5 max-w-[180px]">
                        <div className="flex items-center gap-1.5 group/email">
                          <span className="text-slate-300 font-mono truncate text-[11px]">{pro.email}</span>
                          <button
                            onClick={() => copyEmail(pro.email)}
                            className="opacity-0 group-hover/email:opacity-100 text-slate-600 hover:text-slate-300 transition-all shrink-0"
                            title="Copy email"
                          >
                            {copiedEmail === pro.email
                              ? <CheckCircle className="w-3 h-3 text-emerald-400" />
                              : <Copy className="w-3 h-3" />
                            }
                          </button>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="px-3 py-2.5 border-r border-white/5 max-w-[160px]">
                        <p className="text-white font-medium truncate">{displayName || <span className="text-slate-600 italic">—</span>}</p>
                      </td>

                      {/* Phone */}
                      <td className="px-3 py-2.5 border-r border-white/5 whitespace-nowrap">
                        <span className="text-slate-400 font-mono">{pro.phone || <span className="text-slate-700">—</span>}</span>
                      </td>

                      {/* Hospitals */}
                      <td className="px-3 py-2.5 border-r border-white/5 max-w-[200px]">
                        {pro.hospitals.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {pro.hospitals.map((h) => (
                              <span key={h} className="text-[10px] bg-white/8 text-slate-300 px-1.5 py-0.5 rounded border border-white/10 truncate max-w-[120px]">{h}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>

                      {/* Bank */}
                      <td className="px-3 py-2.5 border-r border-white/5 whitespace-nowrap">
                        {hasBank ? (
                          <div className="flex items-center gap-1.5">
                            <BanknoteIcon className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="text-slate-300 truncate max-w-[90px]">{pro.bank_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>

                      {/* Marketer — clickable assignment */}
                      <td className="px-3 py-2.5 border-r border-white/5 max-w-[140px] relative">
                        {assigningMarketer === pro.email ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMarketerPopover(marketerPopover === pro.email ? null : pro.email)}
                            className="flex items-center gap-1 w-full text-left group/mkt"
                            title="Click to assign marketer"
                          >
                            {pro.marketer ? (
                              <span className="text-slate-300 truncate text-xs font-medium group-hover/mkt:text-white transition-colors">{pro.marketer.name}</span>
                            ) : (
                              <span className="text-slate-600 text-xs group-hover/mkt:text-slate-400 transition-colors">assign…</span>
                            )}
                            <ChevronDown className="w-3 h-3 text-slate-600 shrink-0 group-hover/mkt:text-slate-400 transition-colors ml-auto" />
                          </button>
                        )}
                        {/* Popover */}
                        {marketerPopover === pro.email && (
                          <div
                            ref={marketerPopoverRef}
                            className="absolute top-full left-0 mt-1 z-50 w-52 bg-slate-800 border border-white/15 rounded-xl shadow-2xl overflow-hidden"
                          >
                            {allMarketers.length === 0 ? (
                              <p className="px-3 py-3 text-xs text-slate-500 italic">No marketers found</p>
                            ) : (
                              <ul className="max-h-52 overflow-y-auto divide-y divide-white/5">
                                {allMarketers.map((m) => (
                                  <li key={m.id}>
                                    <button
                                      type="button"
                                      onClick={() => assignMarketer(pro.email, m.id)}
                                      className={`w-full text-left px-3 py-2 text-xs hover:bg-white/8 transition-colors flex items-center gap-2 ${pro.marketer?.id === m.id ? "text-emerald-400 font-semibold" : "text-slate-300"}`}
                                    >
                                      {pro.marketer?.id === m.id && <CheckCircle className="w-3 h-3 shrink-0" />}
                                      <span className="truncate">{m.name}</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {pro.marketer && (
                              <button
                                type="button"
                                onClick={() => assignMarketer(pro.email, null)}
                                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/8"
                              >
                                Remove marketer
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Updated */}
                      <td className="px-3 py-2.5 border-r border-white/5 whitespace-nowrap">
                        <span className="text-slate-600 font-mono">{fmt(pro.updated_at)}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-2 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setEditProfessional(pro)}
                            title="Edit profile"
                            className="p-1.5 rounded-lg hover:bg-blue-500/15 text-slate-500 hover:text-blue-400 transition-all"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {!pro.claimed && (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(pro)}
                              disabled={deletingEmail === pro.email}
                              title="Delete profile"
                              className="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-all disabled:opacity-40"
                            >
                              {deletingEmail === pro.email
                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer count */}
        {sorted.length > 0 && (
          <div className="px-4 py-2 bg-slate-800/60 border-t border-white/8 flex items-center gap-4">
            <span className="text-xs text-slate-600">{sorted.length} row{sorted.length !== 1 ? "s" : ""}</span>
            <span className="text-xs text-slate-700">·</span>
            <span className="text-xs text-emerald-600">{professionals.filter((p) => p.claimed).length} verified</span>
            <span className="text-xs text-amber-700">{professionals.filter((p) => !p.claimed).length} unclaimed</span>
          </div>
        )}
      </div>

      {/* Edit modal */}
      {editProfessional && (
        <EditProfessionalModal
          professional={editProfessional}
          onClose={() => setEditProfessional(null)}
          onSaved={(updated) => {
            setProfessionals((prev) => prev.map((p) => p.email === updated.email ? updated : p));
            setEditProfessional(null);
          }}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateProfessionalModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchProfessionals(); }}
        />
      )}

      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onImported={() => fetchProfessionals()}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <AdminOverlay onClose={() => setConfirmDelete(null)} align="center">
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
        </AdminOverlay>
      )}
    </div>
  );
}
