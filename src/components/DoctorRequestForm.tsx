"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  FlaskConical, User, MapPin, Phone, Stethoscope,
  TestTube2, ChevronRight, ChevronLeft, Building2, Check,
  Search, X, PhoneCall, RefreshCw, ChevronDown, Mail,
} from "lucide-react";

function MarsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="14" r="5" />
      <line x1="14.5" y1="9.5" x2="21" y2="3" />
      <polyline points="16 3 21 3 21 8" />
    </svg>
  );
}

function VenusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="9" r="5" />
      <line x1="12" y1="14" x2="12" y2="21" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  );
}
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { DobInput } from "@/components/DobInput";
import { SuccessScreen } from "@/components/SuccessScreen";
import type { Lab, CreateRequestResponse } from "@/lib/types";

interface FormData {
  lab_id: string;
  patient_name: string;
  dob: string;
  sex: string;
  patient_email: string;
  address: string;
  patient_phone: string;
  doctor_prefix: string;
  doctor_name: string;
  doctor_email: string;
  doctor_phone: string;
  doctor_bank_name: string;
  doctor_account_number: string;
  doctor_account_name: string;
  diagnosis: string;
  tests: string;
}

const INITIAL: FormData = {
  lab_id: "",
  patient_name: "",
  dob: "",
  sex: "",
  patient_email: "",
  address: "",
  patient_phone: "",
  doctor_prefix: "",
  doctor_name: "",
  doctor_email: "",
  doctor_phone: "",
  doctor_bank_name: "",
  doctor_account_number: "",
  doctor_account_name: "",
  diagnosis: "",
  tests: "",
};

const PROFESSIONAL_PREFIXES = [
  { value: "Dr.", label: "Dr. — Medical Doctor / Dentist" },
  { value: "Prof.", label: "Prof. — Professor / Specialist" },
  { value: "Nurse", label: "Nurse — Registered Nurse" },
  { value: "Pharm.", label: "Pharm. — Pharmacist" },
  { value: "CHEW", label: "CHEW — Community Health Extension Worker" },
  { value: "CHO", label: "CHO — Community Health Officer" },
  { value: "PT", label: "PT — Physiotherapist" },
  { value: "OT", label: "OT — Occupational Therapist" },
  { value: "Optom.", label: "Optom. — Optometrist" },
  { value: "MW", label: "MW — Midwife" },
  { value: "HO", label: "HO — House Officer" },
  { value: "MO", label: "MO — Medical Officer" },
  { value: "RN", label: "RN — Registered Nurse" },
  { value: "DVM", label: "DVM — Veterinarian" },
];

function PrefixSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? PROFESSIONAL_PREFIXES.filter((p) =>
        p.value.toLowerCase().includes(query.toLowerCase()) ||
        p.label.toLowerCase().includes(query.toLowerCase())
      )
    : PROFESSIONAL_PREFIXES;

  const selected = PROFESSIONAL_PREFIXES.find((p) => p.value === value);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        Title / Prefix <span className="text-xs text-slate-400 font-normal">(optional)</span>
      </label>
      <div className="relative">
        {selected ? (
          <div className="w-full rounded-xl border border-medical-300 bg-medical-50 px-4 py-2.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-medical-800">{selected.value}</span>
            <button
              type="button"
              onClick={clear}
              className="p-0.5 rounded hover:bg-medical-100 text-medical-400 hover:text-medical-700 shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search title (Dr., Nurse, Pharm., CHEW…)"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pl-10 text-slate-800 placeholder-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
            />
          </div>
        )}
        {open && !selected && (
          <div className="absolute z-20 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-auto max-h-52">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400 text-center">No match</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => select(p.value)}
                  className="w-full text-left px-4 py-2.5 hover:bg-medical-50 transition-colors border-b border-slate-50 last:border-0"
                >
                  <span className="text-sm font-semibold text-slate-800">{p.value}</span>
                  <span className="text-xs text-slate-400 ml-2">{p.label.split("—")[1]?.trim()}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Contact step removed — merged into Patient step as an expandable section
const STEPS = [
  { title: "Laboratory", icon: Building2 },
  { title: "Patient", icon: User },
  { title: "Referrer", icon: Stethoscope },
  { title: "Tests", icon: TestTube2 },
];

const DOCTOR_STORAGE_KEY = "poveon_doctor_profile";

function SummaryRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex justify-between text-xs gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`text-slate-700 font-medium text-right ${capitalize ? "capitalize" : ""}`}>{value || "—"}</span>
    </div>
  );
}

// Searchable lab picker
function LabSearch({
  labs,
  loading,
  value,
  onChange,
  error,
  onRefresh,
}: {
  labs: Lab[];
  loading: boolean;
  value: string;
  onChange: (labId: string) => void;
  error?: string;
  onRefresh?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedLab = labs.find((l) => l.id === value);

  const filtered = query.trim()
    ? labs.filter(
        (l) =>
          l.name.toLowerCase().includes(query.toLowerCase()) ||
          l.address.toLowerCase().includes(query.toLowerCase())
      )
    : labs;

  function select(lab: Lab) {
    onChange(lab.id);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setQuery("");
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        Destination Laboratory <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        {selectedLab ? (
          <div className="w-full rounded-xl border border-medical-300 bg-medical-50 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {selectedLab.logo_url ? (
                <img src={selectedLab.logo_url} alt={selectedLab.name} className="w-6 h-6 rounded-md object-cover shrink-0" />
              ) : (
                <Building2 className="w-4 h-4 text-medical-600 shrink-0" />
              )}
              <span className="text-sm font-medium text-medical-800 truncate">{selectedLab.name}</span>
            </div>
            <button
              type="button"
              onClick={clear}
              className="p-0.5 rounded hover:bg-medical-100 text-medical-400 hover:text-medical-700 shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder={loading ? "Loading laboratories…" : "Search by lab name or address…"}
                value={query}
                disabled={loading}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pl-10 text-slate-800 placeholder-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 disabled:opacity-60"
              />
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-60 shrink-0"
                title="Refresh labs"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
          </div>
        )}
        {open && !selectedLab && (
          <div className="absolute z-20 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-auto max-h-64">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400 text-center">No labs found</div>
            ) : (
              filtered.map((lab) => (
                <button
                  key={lab.id}
                  type="button"
                  onClick={() => select(lab)}
                  className="w-full text-left px-4 py-3 hover:bg-medical-50 transition-colors border-b border-slate-50 last:border-0"
                >
                  <div className="flex items-center gap-2.5">
                    {lab.logo_url ? (
                      <img src={lab.logo_url} alt={lab.name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-medical-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-medical-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{lab.name}</p>
                      {lab.address && (
                        <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />{lab.address}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}

// Floating action button to call the lab — appears on step 2+
function LabCallFAB({ lab }: { lab: Lab | undefined }) {
  const [open, setOpen] = useState(false);
  const phones = lab?.phones as string[] | undefined;
  if (!lab || !phones || phones.length === 0) return null;

  if (phones.length === 1) {
    return (
      <a
        href={`tel:${phones[0]}`}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 bg-medical-600 hover:bg-medical-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-colors"
        title={`Call ${lab.name}`}
      >
        <PhoneCall className="w-6 h-6" />
      </a>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-30">
      {open && (
        <div className="mb-3 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden min-w-[200px] animate-slide-up">
          <p className="text-xs font-semibold text-slate-400 px-4 pt-3 pb-1 uppercase tracking-wider">
            Call {lab.name}
          </p>
          {phones.map((ph, i) => (
            <a
              key={i}
              href={`tel:${ph}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 hover:bg-medical-50 text-medical-700 text-sm font-medium"
            >
              <Phone className="w-4 h-4" />{ph}
            </a>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 bg-medical-600 hover:bg-medical-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all"
        title={open ? "Close" : `Call ${lab.name}`}
      >
        {open ? <X className="w-6 h-6" /> : <PhoneCall className="w-6 h-6" />}
      </button>
    </div>
  );
}

export function DoctorRequestForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labsLoading, setLabsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateRequestResponse | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [savedProfile, setSavedProfile] = useState<{ prefix: string; name: string; email: string; phone: string; bankName: string; accountNumber: string; accountName: string } | null>(null);

  const fetchLabs = useCallback(() => {
    setLabsLoading(true);
    fetch("/api/labs")
      .then((r) => r.json())
      .then((data) => setLabs(data.labs ?? []))
      .catch(() => toast.error("Failed to load laboratories"))
      .finally(() => setLabsLoading(false));
  }, []);

  useEffect(() => {
    fetchLabs();
  }, [fetchLabs]);

  // Load saved referrer profile from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCTOR_STORAGE_KEY);
      if (raw) {
        const profile = JSON.parse(raw) as { prefix: string; name: string; email: string; phone: string; bankName: string; accountNumber: string; accountName: string };
        if (profile.name || profile.email) {
          setSavedProfile(profile);
          setForm((prev) => ({
            ...prev,
            doctor_prefix: profile.prefix || prev.doctor_prefix,
            doctor_name: profile.name || prev.doctor_name,
            doctor_email: profile.email || prev.doctor_email,
            doctor_phone: profile.phone || prev.doctor_phone,
            doctor_bank_name: profile.bankName || prev.doctor_bank_name,
            doctor_account_number: profile.accountNumber || prev.doctor_account_number,
            doctor_account_name: profile.accountName || prev.doctor_account_name,
          }));
        }
      }
    } catch { /* ignore storage errors */ }
  }, []);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function clearDoctorProfile() {
    try { localStorage.removeItem(DOCTOR_STORAGE_KEY); } catch { /* ignore */ }
    setSavedProfile(null);
    setForm((prev) => ({
      ...prev,
      doctor_prefix: "",
      doctor_name: "",
      doctor_email: "",
      doctor_phone: "",
      doctor_bank_name: "",
      doctor_account_number: "",
      doctor_account_name: "",
    }));
  }

  function validateStep(s: number): boolean {
    const errs: Partial<FormData> = {};
    if (s === 1 && !form.lab_id) errs.lab_id = "Please select a laboratory";
    if (s === 2) {
      if (!form.patient_name.trim()) errs.patient_name = "Required";
      if (!form.dob) errs.dob = "Required";
      if (!form.sex) errs.sex = "Required";
      if (form.patient_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email))
        errs.patient_email = "Invalid email";
    }
    if (s === 3) {
      if (!form.doctor_name.trim()) errs.doctor_name = "Required";
      if (!form.doctor_email.trim()) errs.doctor_email = "Required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.doctor_email))
        errs.doctor_email = "Invalid email";
    }
    if (s === 4 && !form.tests.trim()) errs.tests = "Required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (validateStep(step)) setStep((s) => Math.min(4, s + 1));
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit() {
    if (!validateStep(4)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: CreateRequestResponse = await res.json();
      if (data.success) {
        // Persist referrer profile for next time
        try {
          localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify({
            prefix: form.doctor_prefix,
            name: form.doctor_name,
            email: form.doctor_email,
            phone: form.doctor_phone,
            bankName: form.doctor_bank_name,
            accountNumber: form.doctor_account_number,
            accountName: form.doctor_account_name,
          }));
        } catch { /* ignore storage errors */ }
        setResult(data);
      } else {
        toast.error(data.error ?? "Failed to submit request");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.success) {
    return (
      <SuccessScreen
        code={result.code!}
        labName={result.lab?.name ?? ""}
        labAddress={result.lab?.address ?? ""}
        labPhones={result.lab?.phones ?? []}
        onReset={() => { setResult(null); setForm(INITIAL); setStep(1); setSavedProfile(null); }}
      />
    );
  }

  const selectedLab = labs.find((l) => l.id === form.lab_id);

  return (
    <div className="animate-fade-in">
      {/* Header — swaps to lab branding once a lab is selected */}
      <div className="text-center mb-8">
        {selectedLab ? (
          <div className="space-y-2 animate-fade-in">
            {selectedLab.logo_url ? (
              <img
                src={selectedLab.logo_url}
                alt={selectedLab.name}
                className="w-16 h-16 rounded-2xl object-cover mx-auto shadow-lg"
              />
            ) : (
              <div className="inline-flex items-center justify-center w-16 h-16 bg-medical-100 rounded-2xl border border-medical-200">
                <Building2 className="w-8 h-8 text-medical-600" />
              </div>
            )}
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{selectedLab.name}</h1>
            {selectedLab.description && (
              <p className="text-slate-500 text-sm max-w-sm mx-auto">{selectedLab.description}</p>
            )}
            {selectedLab.address && (
              <p className="text-slate-500 text-sm flex items-center justify-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {selectedLab.address}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="inline-flex items-center justify-center w-16 h-16 bg-medical-600 rounded-2xl mb-4 shadow-lg">
              <FlaskConical className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">
              Laboratory Request
            </h1>
            <p className="text-slate-500 text-base max-w-md mx-auto">
              Submit a lab test request for your patient. No account required.
            </p>
          </>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => {
          const num = i + 1;
          const done = num < step;
          const active = num === step;
          const Icon = s.icon;
          return (
            <div key={s.title} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  done ? "bg-medical-600 text-white" :
                  active ? "bg-medical-600 text-white ring-4 ring-medical-100" :
                  "bg-slate-100 text-slate-400"
                }`}>
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <p className={`text-xs mt-1 font-medium hidden sm:block whitespace-nowrap ${
                  active ? "text-medical-600" : done ? "text-slate-500" : "text-slate-400"
                }`}>
                  {s.title}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 rounded transition-all ${done ? "bg-medical-400" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="glass-card p-6 mb-5">

        {/* Step 1: Choose Lab */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-medical-600" />
              Select Laboratory
            </h2>
            <LabSearch
              labs={labs}
              loading={labsLoading}
              value={form.lab_id}
              onChange={(id) => set("lab_id", id)}
              error={errors.lab_id}
              onRefresh={fetchLabs}
            />
            {selectedLab && (
              <div className="bg-medical-50 border border-medical-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {selectedLab.logo_url ? (
                    <img src={selectedLab.logo_url} alt={selectedLab.name} className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <Building2 className="w-4 h-4 text-medical-600" />
                  )}
                  <p className="text-sm font-semibold text-medical-800">{selectedLab.name}</p>
                </div>
                {selectedLab.address && (
                  <p className="text-xs text-medical-600 flex items-start gap-1.5">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />{selectedLab.address}
                  </p>
                )}
                {(selectedLab.phones as string[]).map((ph, i) => (
                  <p key={i} className="text-xs text-medical-600 flex items-center gap-1.5">
                    <Phone className="w-3 h-3 shrink-0" />{ph}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Patient Information + optional contact details */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <User className="w-4 h-4 text-medical-600" />
              Patient Information
            </h2>
            <Input
              label="Patient Full Name"
              required
              placeholder="e.g. Amara Okonkwo"
              value={form.patient_name}
              onChange={(e) => set("patient_name", e.target.value)}
              error={errors.patient_name}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DobInput
                required
                value={form.dob}
                onChange={(iso) => set("dob", iso)}
                error={errors.dob}
              />
              {/* Sex selector */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">
                  Sex<span className="text-red-500 ml-0.5">*</span>
                </label>
                <div className="flex gap-2">
                  {(["male", "female"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("sex", s)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold ${
                        form.sex === s
                          ? "border-medical-400 bg-medical-50 text-medical-700"
                          : errors.sex
                          ? "border-red-300 bg-white/60 text-slate-500 hover:border-slate-300"
                          : "border-slate-200 bg-white/60 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {s === "male"
                        ? <MarsIcon className={`w-4 h-4 ${form.sex === s ? "text-medical-500" : "text-slate-400"}`} />
                        : <VenusIcon className={`w-4 h-4 ${form.sex === s ? "text-medical-500" : "text-slate-400"}`} />}
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                {errors.sex && <p className="text-xs text-red-600 font-medium">{errors.sex}</p>}
              </div>
            </div>

            {/* Patient Email — outside dropdown, recommended */}
            <div className="flex flex-col gap-1">
              <label htmlFor="patient_email" className="text-sm font-medium text-slate-700 flex items-center gap-2">
                Patient Email
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Recommended</span>
              </label>
              <Input
                id="patient_email"
                type="email"
                placeholder="patient@example.com"
                hint="Patient will receive their request code & results by email"
                value={form.patient_email}
                onChange={(e) => set("patient_email", e.target.value)}
                error={errors.patient_email}
              />
            </div>

            {/* Expandable: Address & Phone */}
            {form.address || form.patient_phone ? (
              <div className="border-2 border-emerald-200 bg-emerald-50/30 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setContactOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-emerald-50/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-sm font-semibold text-slate-700">Additional details added</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-emerald-500 transition-transform shrink-0 ${contactOpen ? "rotate-180" : ""}`} />
                </button>
                {contactOpen && (
                  <div className="px-4 pb-4 pt-1 space-y-4 border-t border-emerald-100 bg-emerald-50/20">
                    <Input
                      label="Patient Address"
                      placeholder="Home address"
                      value={form.address}
                      onChange={(e) => set("address", e.target.value)}
                    />
                    <Input
                      label="Patient Phone"
                      type="tel"
                      placeholder="+1 555 000 0000"
                      value={form.patient_phone}
                      onChange={(e) => set("patient_phone", e.target.value)}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-slate-200 bg-slate-50/40 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setContactOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="text-left">
                      <span className="text-sm font-semibold text-slate-700">Address &amp; Phone</span>
                      <p className="text-xs text-slate-400 mt-0.5">Optional — add patient address and phone number</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ml-3 ${contactOpen ? "rotate-180" : ""}`} />
                </button>
                {contactOpen && (
                  <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100 bg-slate-50/20">
                    <Input
                      label="Patient Address"
                      placeholder="Home address"
                      value={form.address}
                      onChange={(e) => set("address", e.target.value)}
                    />
                    <Input
                      label="Patient Phone"
                      type="tel"
                      placeholder="+1 555 000 0000"
                      value={form.patient_phone}
                      onChange={(e) => set("patient_phone", e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Referring Professional */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <Stethoscope className="w-4 h-4 text-medical-600" />
              Referring Professional
            </h2>

            {/* Saved profile banner */}
            {savedProfile && (
              <div className="flex items-center justify-between bg-medical-50 border border-medical-100 rounded-xl px-4 py-2.5">
                <p className="text-xs text-medical-700 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-medical-600 shrink-0" />
                  Pre-filled from your saved profile
                </p>
                <button
                  type="button"
                  onClick={clearDoctorProfile}
                  className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 shrink-0 ml-3"
                >
                  Not you? Clear
                </button>
              </div>
            )}

            <PrefixSelect
              value={form.doctor_prefix}
              onChange={(v) => set("doctor_prefix", v)}
            />
            <Input
              label="Full Name"
              required
              placeholder="Firstname Lastname"
              value={form.doctor_name}
              onChange={(e) => set("doctor_name", e.target.value)}
              error={errors.doctor_name}
            />
            <Input
              label="Email"
              type="email"
              required
              placeholder="you@hospital.com"
              hint="You will receive request updates here"
              value={form.doctor_email}
              onChange={(e) => set("doctor_email", e.target.value)}
              error={errors.doctor_email}
            />
            <Input
              label="Phone"
              type="tel"
              placeholder="+234 800 000 0000"
              value={form.doctor_phone}
              onChange={(e) => set("doctor_phone", e.target.value)}
            />

            {/* Bank account details — collapsible, for payment processing */}
            {form.doctor_bank_name || form.doctor_account_number || form.doctor_account_name ? (
              <div className="border-2 border-emerald-200 bg-emerald-50/30 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setBankOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-emerald-50/50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="text-sm font-semibold text-slate-700">Bank details added</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-emerald-500 transition-transform shrink-0 ${bankOpen ? "rotate-180" : ""}`} />
                </button>
                {bankOpen && (
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-emerald-100 bg-emerald-50/20">
                    <Input
                      label="Bank Name"
                      placeholder="e.g. First Bank, GTBank, Zenith…"
                      value={form.doctor_bank_name}
                      onChange={(e) => set("doctor_bank_name", e.target.value)}
                    />
                    <Input
                      label="Account Number"
                      placeholder="10-digit account number"
                      value={form.doctor_account_number}
                      onChange={(e) => set("doctor_account_number", e.target.value)}
                    />
                    <Input
                      label="Account Name"
                      placeholder="Name as it appears on bank account"
                      value={form.doctor_account_name}
                      onChange={(e) => set("doctor_account_name", e.target.value)}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="border-2 border-slate-200 bg-slate-50/40 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setBankOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="text-left">
                      <span className="text-sm font-semibold text-slate-700">Bank Account Details</span>
                      <p className="text-xs text-slate-400 mt-0.5">Optional — for referral payment processing</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ml-3 ${bankOpen ? "rotate-180" : ""}`} />
                </button>
                {bankOpen && (
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100 bg-slate-50/20">
                    <Input
                      label="Bank Name"
                      placeholder="e.g. First Bank, GTBank, Zenith…"
                      value={form.doctor_bank_name}
                      onChange={(e) => set("doctor_bank_name", e.target.value)}
                    />
                    <Input
                      label="Account Number"
                      placeholder="10-digit account number"
                      value={form.doctor_account_number}
                      onChange={(e) => set("doctor_account_number", e.target.value)}
                    />
                    <Input
                      label="Account Name"
                      placeholder="Name as it appears on bank account"
                      value={form.doctor_account_name}
                      onChange={(e) => set("doctor_account_name", e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Clinical Details + Review */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <TestTube2 className="w-4 h-4 text-medical-600" />
              Clinical Details
            </h2>
            <Textarea
              label="Diagnosis / Clinical Notes"
              placeholder="Brief clinical summary or working diagnosis…"
              rows={3}
              value={form.diagnosis}
              onChange={(e) => set("diagnosis", e.target.value)}
            />
            <Textarea
              label="Laboratory Tests Requested"
              required
              placeholder="e.g. FBC, LFT, Serum electrolytes, Fasting glucose, Urinalysis…"
              rows={4}
              hint="List all tests separated by commas or new lines"
              value={form.tests}
              onChange={(e) => set("tests", e.target.value)}
              error={errors.tests}
            />
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Review</p>
              <SummaryRow label="Lab" value={selectedLab?.name ?? ""} />
              <SummaryRow label="Patient" value={form.patient_name} />
              <SummaryRow label="Date of Birth" value={form.dob ? form.dob.split("-").reverse().join(" / ") : ""} />
              <SummaryRow label="Sex" value={form.sex} capitalize />
              <SummaryRow label="Referrer" value={[form.doctor_prefix, form.doctor_name].filter(Boolean).join(" ")} />
              <SummaryRow label="Referrer Email" value={form.doctor_email} />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className={`flex gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
        {step > 1 && (
          <Button variant="ghost" onClick={handleBack} type="button">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        )}
        {step < 4 ? (
          <Button onClick={handleNext} type="button">
            Continue
            <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            loading={submitting}
            size="lg"
            className="shadow-xl shadow-medical-500/20"
          >
            <FlaskConical className="w-5 h-5" />
            Generate Lab Request
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-slate-400 mt-4">
        By submitting, you confirm you are authorised to request these tests on behalf of the patient.
      </p>

      {/* Floating call button — shown on steps 2+ when selected lab has phone numbers */}
      {step >= 2 && <LabCallFAB lab={selectedLab} />}
    </div>
  );
}
