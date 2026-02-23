"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  FlaskConical, User, MapPin, Phone, Stethoscope,
  TestTube2, ChevronRight, ChevronLeft, Building2, Check,
  Search, X, PhoneCall, RefreshCw, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SuccessScreen } from "@/components/SuccessScreen";
import type { Lab, CreateRequestResponse } from "@/lib/types";

interface FormData {
  lab_id: string;
  patient_name: string;
  dob: string;
  sex: string;
  address: string;
  patient_email: string;
  doctor_name: string;
  doctor_email: string;
  doctor_phone: string;
  diagnosis: string;
  tests: string;
}

const INITIAL: FormData = {
  lab_id: "",
  patient_name: "",
  dob: "",
  sex: "",
  address: "",
  patient_email: "",
  doctor_name: "",
  doctor_email: "",
  doctor_phone: "",
  diagnosis: "",
  tests: "",
};

// Contact step removed — merged into Patient step as an expandable section
const STEPS = [
  { title: "Laboratory", icon: Building2 },
  { title: "Patient", icon: User },
  { title: "Physician", icon: Stethoscope },
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
  const [savedProfile, setSavedProfile] = useState<{ name: string; email: string; phone: string } | null>(null);

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

  // Load saved doctor profile from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCTOR_STORAGE_KEY);
      if (raw) {
        const profile = JSON.parse(raw) as { name: string; email: string; phone: string };
        if (profile.name || profile.email) {
          setSavedProfile(profile);
          setForm((prev) => ({
            ...prev,
            doctor_name: profile.name || prev.doctor_name,
            doctor_email: profile.email || prev.doctor_email,
            doctor_phone: profile.phone || prev.doctor_phone,
          }));
        }
      }
    } catch { /* ignore storage errors */ }
  }, []);

  // Auto-open contact section if email field has a validation error
  useEffect(() => {
    if (errors.patient_email) setContactOpen(true);
  }, [errors.patient_email]);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function clearDoctorProfile() {
    try { localStorage.removeItem(DOCTOR_STORAGE_KEY); } catch { /* ignore */ }
    setSavedProfile(null);
    setForm((prev) => ({ ...prev, doctor_name: "", doctor_email: "", doctor_phone: "" }));
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
        // Persist doctor profile for next time
        try {
          localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify({
            name: form.doctor_name,
            email: form.doctor_email,
            phone: form.doctor_phone,
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
              <Input
                label="Date of Birth"
                type="date"
                required
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
                error={errors.dob}
              />
              <Select
                label="Sex"
                required
                value={form.sex}
                onChange={(e) => set("sex", e.target.value)}
                placeholder="Select sex"
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                ]}
                error={errors.sex}
              />
            </div>

            {/* Expandable contact details */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setContactOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {form.address || form.patient_email ? (
                    <span className="font-medium text-slate-700">Contact details added</span>
                  ) : (
                    "Add contact details"
                  )}
                  <span className="text-xs text-slate-400">(optional)</span>
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${contactOpen ? "rotate-180" : ""}`} />
              </button>
              {contactOpen && (
                <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100 bg-slate-50/50">
                  <Input
                    label="Patient Address"
                    placeholder="Home address"
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                  <Input
                    label="Patient Email"
                    type="email"
                    placeholder="patient@example.com"
                    hint="Patient will receive their request code by email"
                    value={form.patient_email}
                    onChange={(e) => set("patient_email", e.target.value)}
                    error={errors.patient_email}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Referring Physician */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <Stethoscope className="w-4 h-4 text-medical-600" />
              Referring Physician
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

            <Input
              label="Doctor Name"
              required
              placeholder="Dr. Firstname Lastname"
              value={form.doctor_name}
              onChange={(e) => set("doctor_name", e.target.value)}
              error={errors.doctor_name}
            />
            <Input
              label="Doctor Email"
              type="email"
              required
              placeholder="doctor@hospital.com"
              hint="You will receive request updates here"
              value={form.doctor_email}
              onChange={(e) => set("doctor_email", e.target.value)}
              error={errors.doctor_email}
            />
            <Input
              label="Doctor Phone"
              type="tel"
              placeholder="+234 800 000 0000"
              value={form.doctor_phone}
              onChange={(e) => set("doctor_phone", e.target.value)}
            />
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
              <SummaryRow label="Date of Birth" value={form.dob} />
              <SummaryRow label="Sex" value={form.sex} capitalize />
              <SummaryRow label="Doctor" value={form.doctor_name} />
              <SummaryRow label="Doctor Email" value={form.doctor_email} />
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
