"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import Link from "next/link";
import {
  User, FileText, Building2, Send, Check, ChevronLeft, ChevronRight,
  Sparkles, Undo2, X, Search, MapPin, Loader2, RefreshCw, Copy, Link2,
  Stethoscope, Phone, Eye, EyeOff, Info, Lightbulb, ShieldCheck,
  Clock, AlertTriangle, Siren,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { PhoneInput } from "@/components/PhoneInput";
import { MEDICAL_SPECIALTIES } from "@/lib/specialties";
import { URGENCY_CONFIG, type ReferralUrgency } from "@/components/referral/shared";

const STEPS = [
  { title: "Patient", icon: User },
  { title: "Referral note", icon: FileText },
  { title: "Hospital", icon: Building2 },
  { title: "Review & send", icon: Send },
];

interface SuggestedHospital {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  address: string | null;
  specialties: string[] | null;
}

const URGENCY_OPTIONS: { value: ReferralUrgency; label: string; icon: React.ReactNode; active: string }[] = [
  { value: "routine", label: "Routine", icon: <Clock className="w-3.5 h-3.5" />, active: "bg-medical-600 border-medical-600 text-white" },
  { value: "urgent", label: "Urgent", icon: <AlertTriangle className="w-3.5 h-3.5" />, active: "bg-amber-500 border-amber-500 text-white" },
  { value: "emergency", label: "Emergency", icon: <Siren className="w-3.5 h-3.5" />, active: "bg-red-600 border-red-600 text-white" },
];

// ─── Success screen ───────────────────────────────────────────────────────────

function ReferralSuccessScreen({
  data,
}: {
  data: { code: string; hospital: { name: string; address: string | null; phone: string | null } };
}) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyCode() {
    try { await navigator.clipboard.writeText(data.code); } catch { /* ignore */ }
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  }
  async function copyLink() {
    const url = `${window.location.origin}/refer/track/${data.code}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 3000);
  }

  return (
    <div className="animate-slide-up space-y-4 pt-4 pb-12">
      <div className="text-center py-2">
        <div className="w-16 h-16 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Referral Sent!</h2>
        <p className="text-sm text-slate-500 mt-1.5">
          The receiving hospital has been notified and will review the referral.
        </p>
      </div>

      <div className="glass-card p-5">
        <p className="text-[10px] font-bold text-medical-500 uppercase tracking-widest text-center mb-2">
          Referral Code
        </p>
        <div className="flex items-center justify-center gap-3">
          <p className="text-3xl sm:text-4xl font-black text-medical-700 font-mono tracking-[0.12em] py-1 break-all text-center">
            {data.code}
          </p>
          <button
            onClick={copyCode}
            className="p-2 rounded-xl bg-medical-50 border border-medical-200 hover:bg-medical-100 transition-colors shrink-0"
            title={codeCopied ? "Copied!" : "Copy code"}
          >
            {codeCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-medical-600" />}
          </button>
        </div>
        <p className="text-xs text-center text-medical-600 mt-2 font-medium">
          The patient can present this code at the receiving hospital
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Link
            href={`/refer/track/${data.code}`}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-medical-600 hover:bg-medical-700 text-xs font-semibold text-white transition-colors shadow-sm"
          >
            <Search className="w-3.5 h-3.5" />
            Track this referral
          </Link>
          <button
            onClick={copyLink}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-medical-200 bg-white hover:bg-medical-50 text-xs font-semibold text-medical-700 transition-colors"
          >
            {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
            {linkCopied ? "Link copied!" : "Copy tracking link"}
          </button>
        </div>
      </div>

      <div className="glass-card px-4 py-3.5 space-y-1">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Destination Hospital</p>
        <p className="text-sm font-bold text-slate-800">{data.hospital.name}</p>
        {data.hospital.address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.hospital.name + " " + data.hospital.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-1.5 mt-0.5 group"
          >
            <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-medical-400" />
            <span className="text-xs text-medical-600 group-hover:underline">{data.hospital.address}</span>
          </a>
        )}
        {data.hospital.phone && (
          <a href={`tel:${data.hospital.phone}`} className="flex items-center gap-1.5 text-xs font-medium text-medical-700 hover:text-medical-900 transition-colors mt-1">
            <Phone className="w-3 h-3 shrink-0 text-medical-400" />
            {data.hospital.phone}
          </a>
        )}
      </div>

      <div className="glass-card p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">What happens next</p>
        <ol className="space-y-3">
          {[
            "The receiving hospital reviews the referral and accepts, declines, or redirects it.",
            "You, the patient and the referring hospital are notified by email and SMS at every step.",
            "Track progress any time using the referral code on the tracking page.",
          ].map((txt, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-medical-100 text-medical-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{txt}</p>
            </li>
          ))}
        </ol>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="w-full text-sm font-semibold text-medical-600 hover:text-medical-700 py-2.5 rounded-xl hover:bg-medical-50 transition-colors"
      >
        Write another referral
      </button>
    </div>
  );
}

// ─── Main composer ────────────────────────────────────────────────────────────

export function ReferralComposer() {
  // Step navigation
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);

  // Step 1 — patient
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientSex, setPatientSex] = useState<"" | "male" | "female" | "other">("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [hospitalNumber, setHospitalNumber] = useState("");
  const [fromHospital, setFromHospital] = useState("");
  const [urgency, setUrgency] = useState<ReferralUrgency>("routine");

  // Step 2 — referral note
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNote, setClinicalNote] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPreviousNote, setAiPreviousNote] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Step 3 — hospital
  const [specialty, setSpecialty] = useState("");
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const [hospitals, setHospitals] = useState<SuggestedHospital[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitalsError, setHospitalsError] = useState("");
  const [hospitalQuery, setHospitalQuery] = useState("");
  const [hospitalsRefresh, setHospitalsRefresh] = useState(0);
  const [selectedHospital, setSelectedHospital] = useState<SuggestedHospital | null>(null);

  // Step 4 — doctor verification & sending
  const [doctorEmail, setDoctorEmail] = useState("");
  const [doctorPin, setDoctorPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<{ message: string; kind: "auth" | "registration" | "other" } | null>(null);
  const [successData, setSuccessData] = useState<{
    code: string;
    hospital: { name: string; address: string | null; phone: string | null };
  } | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Auto-grow the writing surface
  const autoGrow = useCallback(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 240)}px`;
  }, []);
  useEffect(() => { if (step === 2) autoGrow(); }, [step, clinicalNote, autoGrow]);

  // Load suggested hospitals when specialty (or search) changes
  useEffect(() => {
    if (!specialty) { setHospitals([]); return; }
    let cancelled = false;
    setHospitalsLoading(true);
    setHospitalsError("");
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ specialty });
        if (hospitalQuery.trim()) params.set("q", hospitalQuery.trim());
        const res = await fetch(`/api/referrals/suggest?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setHospitalsError(data.error ?? "Failed to load hospitals."); return; }
        setHospitals(data.hospitals ?? []);
      } catch {
        if (!cancelled) setHospitalsError("Network error — could not load hospitals.");
      } finally {
        if (!cancelled) setHospitalsLoading(false);
      }
    }, hospitalQuery ? 350 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [specialty, hospitalQuery, hospitalsRefresh]);

  // ── AI assist ────────────────────────────────────────────────────────────────
  async function handleAiImprove() {
    if (clinicalNote.trim().length < 10) {
      toast.error("Write a draft note first (a few sentences is enough).");
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch("/api/referrals/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: clinicalNote,
          patient: {
            name: patientName || undefined,
            age: patientAge ? parseInt(patientAge) : undefined,
            sex: patientSex || undefined,
          },
          specialty: specialty || undefined,
          diagnosis: diagnosis || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "AI assist is unavailable right now.");
        return;
      }
      setAiPreviousNote(clinicalNote);
      setClinicalNote(data.note);
      setAiSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      if (data.specialty && !specialty) setSpecialty(data.specialty);
      toast.success("Note restructured — review it before sending.");
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  function undoAi() {
    if (aiPreviousNote === null) return;
    setClinicalNote(aiPreviousNote);
    setAiPreviousNote(null);
    setAiSuggestions([]);
  }

  // ── Validation per step ──────────────────────────────────────────────────────
  const stepValid = (() => {
    if (step === 1) {
      return (
        patientName.trim().length >= 2 &&
        patientPhone.trim().length >= 7 &&
        fromHospital.trim().length >= 2
      );
    }
    if (step === 2) return clinicalNote.trim().length >= 20;
    if (step === 3) return !!specialty && !!selectedHospital;
    return true;
  })();

  const canSend =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doctorEmail.trim()) && /^\d{4}$/.test(doctorPin);

  function handleNext() {
    const next = step + 1;
    setStep(next);
    setMaxStep((m) => Math.max(m, next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Send ─────────────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!selectedHospital) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/referrals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctor_email: doctorEmail.trim(),
          doctor_pin: doctorPin,
          patient_name: patientName.trim(),
          patient_age: patientAge ? parseInt(patientAge) : undefined,
          patient_sex: patientSex || undefined,
          patient_phone: patientPhone.trim(),
          patient_email: patientEmail.trim() || undefined,
          hospital_number: hospitalNumber.trim() || undefined,
          from_hospital: fromHospital.trim(),
          to_hospital_id: selectedHospital.id,
          specialty,
          urgency,
          clinical_note: clinicalNote.trim(),
          provisional_diagnosis: diagnosis.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const kind = res.status === 401 ? "auth" : res.status === 403 ? "registration" : "other";
        setSendError({ message: data.error ?? "Failed to send the referral.", kind });
        return;
      }
      setSuccessData({ code: data.code, hospital: data.hospital });
      window.scrollTo({ top: 0 });
    } catch {
      setSendError({ message: "Network error — please check your connection and try again.", kind: "other" });
    } finally {
      setSending(false);
    }
  }

  if (successData) return <ReferralSuccessScreen data={successData} />;

  // ── Step 3 helpers ───────────────────────────────────────────────────────────
  const filteredSpecialties = specialtyQuery.trim()
    ? MEDICAL_SPECIALTIES.filter((s) => s.toLowerCase().includes(specialtyQuery.trim().toLowerCase()))
    : MEDICAL_SPECIALTIES;

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="animate-fade-in pb-32">
      {/* ── Sticky step header ── */}
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-3 pb-3 bg-white/85 backdrop-blur-md border-b border-slate-100">
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const done = num < step;
            const active = num === step;
            const visited = num <= maxStep;
            const Icon = s.icon;
            return (
              <div key={s.title} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => visited && num < step && setStep(num)}
                    disabled={!visited || num >= step}
                    className={`rounded-full flex items-center justify-center transition-all border-2 focus:outline-none ${
                      done
                        ? "w-6 h-6 bg-slate-700 text-white border-slate-700 cursor-pointer hover:bg-medical-600 hover:border-medical-600"
                        : active
                        ? "w-7 h-7 bg-slate-900 text-white border-slate-800 ring-2 ring-slate-900/10 cursor-default"
                        : "w-6 h-6 bg-white text-slate-300 border-slate-200 cursor-default"
                    }`}
                  >
                    {done ? <Check className="w-2.5 h-2.5" /> : <Icon className={active ? "w-3 h-3" : "w-2.5 h-2.5"} />}
                  </button>
                  <p className={`text-[11px] whitespace-nowrap mt-1 hidden sm:block ${
                    active ? "font-semibold text-slate-800" : done ? "font-medium text-slate-500" : "font-medium text-slate-400"
                  }`}>
                    {s.title}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1.5 sm:mb-4 rounded transition-colors ${done ? "bg-slate-500" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step 1: Patient ── */}
      {step === 1 && (
        <div className="mt-4 space-y-4">
          <div className="glass-card p-4 sm:p-5 space-y-4">
            <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-medical-600" />
              </div>
              Patient Details
            </h2>

            <Input
              label="Patient full name"
              placeholder="e.g. Adaeze Okafor"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Age"
                type="number"
                min="0"
                max="130"
                placeholder="e.g. 42"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
              />
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Sex</label>
                <select
                  value={patientSex}
                  onChange={(e) => setPatientSex(e.target.value as typeof patientSex)}
                  className="w-full rounded-xl border border-slate-200 hover:border-slate-300 bg-white/60 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 transition-colors"
                >
                  <option value="">Not specified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <PhoneInput
              label="Patient phone number"
              required
              value={patientPhone}
              onChange={setPatientPhone}
            />

            <Input
              label="Patient email (optional)"
              type="email"
              placeholder="patient@email.com"
              value={patientEmail}
              onChange={(e) => setPatientEmail(e.target.value)}
              hint="For referral updates by email."
            />

            <Input
              label="Hospital number (optional)"
              placeholder="e.g. UCH/2024/00123"
              value={hospitalNumber}
              onChange={(e) => setHospitalNumber(e.target.value)}
            />
          </div>

          <div className="glass-card p-4 sm:p-5 space-y-4">
            <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-medical-600" />
              </div>
              Referring From
            </h2>

            <Input
              label="Hospital / clinic the patient is coming from"
              placeholder="e.g. St. Mary's Clinic, Surulere"
              value={fromHospital}
              onChange={(e) => setFromHospital(e.target.value)}
              required
            />

            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Urgency</p>
              <div className="flex gap-2 flex-wrap">
                {URGENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUrgency(opt.value)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border-2 transition-all ${
                      urgency === opt.value
                        ? opt.active
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Referral note (document-like writing surface) ── */}
      {step === 2 && (
        <div className="mt-4 space-y-4">
          {/* AI controls */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-slate-500">
              Write naturally — the AI can restructure it into a clinical letter.
            </p>
            <div className="flex items-center gap-2">
              {aiPreviousNote !== null && (
                <button
                  type="button"
                  onClick={undoAi}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
              )}
              <button
                type="button"
                onClick={handleAiImprove}
                disabled={aiLoading || clinicalNote.trim().length < 10}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-medical-600 to-indigo-600 text-white text-xs font-semibold shadow-sm shadow-medical-600/30 hover:from-medical-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
              >
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {aiLoading ? "Improving…" : "✨ Improve with AI"}
              </button>
            </div>
          </div>

          {/* AI suggestions */}
          {aiSuggestions.length > 0 && (
            <div className="space-y-1.5 animate-fade-in-up">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1">
                <Lightbulb className="w-3 h-3" /> Consider adding
              </p>
              {aiSuggestions.map((sugg) => (
                <div
                  key={sugg}
                  className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200"
                >
                  <p className="text-xs text-amber-800 flex-1 leading-relaxed">{sugg}</p>
                  <button
                    type="button"
                    onClick={() => setAiSuggestions((prev) => prev.filter((s) => s !== sugg))}
                    className="p-0.5 rounded-md text-amber-400 hover:text-amber-700 hover:bg-amber-100 transition-colors shrink-0"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* The document sheet */}
          <div className="bg-white rounded-lg shadow-[0_2px_18px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70 px-5 py-7 sm:px-10 sm:py-10">
            <div className="border-b border-slate-100 pb-4 mb-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Referral Letter</p>
              <p className="text-xs text-slate-400 mt-1">{today}{fromHospital ? ` · ${fromHospital}` : ""}</p>
              {patientName && (
                <p className="text-sm text-slate-700 mt-2 font-serif">
                  Re: <span className="font-semibold">{patientName}</span>
                  {patientAge ? `, ${patientAge} yrs` : ""}{patientSex ? `, ${patientSex}` : ""}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                Provisional diagnosis (optional)
              </label>
              <input
                type="text"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. ?Acute appendicitis"
                className="w-full border-0 border-b border-dashed border-slate-200 focus:border-medical-400 focus:outline-none focus:ring-0 bg-transparent px-0 py-1.5 text-[15px] font-serif text-slate-800 placeholder:text-slate-300 placeholder:font-sans placeholder:text-sm transition-colors"
              />
            </div>

            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Clinical note
            </label>
            <textarea
              ref={noteRef}
              value={clinicalNote}
              onChange={(e) => setClinicalNote(e.target.value)}
              onInput={autoGrow}
              placeholder={"Dear colleague,\n\nThank you for seeing this patient who presented with…\n\nInclude the history, examination findings, investigations done, treatment given and your reason for referral."}
              className="w-full min-h-[240px] resize-none border-0 focus:outline-none focus:ring-0 bg-transparent px-0 py-1 text-[15px] leading-7 font-serif text-slate-800 placeholder:text-slate-300 placeholder:font-sans placeholder:text-sm"
              spellCheck
            />

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] text-slate-300 uppercase tracking-widest">Poveon Referral Network</p>
              <p className={`text-xs ${clinicalNote.trim().length >= 20 ? "text-slate-400" : "text-amber-500 font-medium"}`}>
                {clinicalNote.trim().length < 20
                  ? `At least 20 characters (${clinicalNote.trim().length}/20)`
                  : `${clinicalNote.trim().length.toLocaleString()} characters`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Hospital ── */}
      {step === 3 && (
        <div className="mt-4 space-y-4">
          <div className="glass-card p-4 sm:p-5 space-y-3">
            <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                <Stethoscope className="w-4 h-4 text-medical-600" />
              </div>
              Receiving Specialty
            </h2>

            {specialty ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-medical-600 text-white text-sm font-semibold">
                  {specialty}
                  <button
                    type="button"
                    onClick={() => { setSpecialty(""); setSelectedHospital(null); setHospitalQuery(""); }}
                    className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center hover:bg-white/40 transition-colors"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </span>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search specialties…"
                    value={specialtyQuery}
                    onChange={(e) => setSpecialtyQuery(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
                  />
                </div>
                <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1">
                  {filteredSpecialties.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2">No specialties match &ldquo;{specialtyQuery}&rdquo;</p>
                  ) : (
                    filteredSpecialties.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setSpecialty(s); setSelectedHospital(null); setSpecialtyQuery(""); }}
                        className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:border-medical-300 hover:bg-medical-50 hover:text-medical-700 transition-all"
                      >
                        {s}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {specialty && (
            <div className="glass-card p-4 sm:p-5 space-y-3 animate-fade-in-up">
              <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-medical-600" />
                </div>
                Receiving Hospital
              </h2>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter by name, city or state…"
                  value={hospitalQuery}
                  onChange={(e) => setHospitalQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
                />
              </div>

              {hospitalsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : hospitalsError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center justify-between gap-3">
                  {hospitalsError}
                  <button
                    type="button"
                    onClick={() => setHospitalsRefresh((n) => n + 1)}
                    className="text-xs font-semibold underline shrink-0"
                  >
                    Retry
                  </button>
                </div>
              ) : hospitals.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center">
                  <p className="text-sm font-semibold text-amber-800">No hospitals found</p>
                  <p className="text-xs text-amber-600 mt-1">
                    No hospital on the referral network currently offers {specialty}
                    {hospitalQuery ? ` matching “${hospitalQuery}”` : ""}. Try another specialty or clear the search.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {hospitals.map((h) => {
                    const selected = selectedHospital?.id === h.id;
                    const specs = Array.isArray(h.specialties) ? h.specialties : [];
                    return (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedHospital(selected ? null : h)}
                          className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
                            selected
                              ? "border-medical-500 bg-medical-50 shadow-sm shadow-medical-600/10"
                              : "border-slate-200 bg-white hover:border-medical-300 hover:bg-medical-50/40"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-medical-600" : "bg-medical-100"}`}>
                              <Building2 className={`w-4 h-4 ${selected ? "text-white" : "text-medical-600"}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-slate-800 truncate">{h.name}</p>
                                {selected && (
                                  <span className="w-4 h-4 rounded-full bg-medical-600 flex items-center justify-center shrink-0">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </span>
                                )}
                              </div>
                              {(h.city || h.state) && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {[h.city, h.state].filter(Boolean).join(", ")}
                                </p>
                              )}
                              {h.address && (
                                <p className="text-xs text-slate-400 flex items-start gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span className="truncate">{h.address}</span>
                                </p>
                              )}
                              {specs.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {specs.slice(0, 4).map((s) => (
                                    <span
                                      key={s}
                                      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                        s === specialty
                                          ? "bg-medical-100 border-medical-200 text-medical-700 font-semibold"
                                          : "bg-slate-50 border-slate-200 text-slate-400"
                                      }`}
                                    >
                                      {s}
                                    </span>
                                  ))}
                                  {specs.length > 4 && (
                                    <span className="text-[10px] px-1.5 py-0.5 text-slate-400">+{specs.length - 4} more</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Step 4: Review & send ── */}
      {step === 4 && (
        <div className="mt-4 space-y-4">
          {/* Letter preview */}
          <div className="bg-white rounded-lg shadow-[0_2px_18px_rgba(15,23,42,0.10)] ring-1 ring-slate-200/70 px-5 py-7 sm:px-10 sm:py-10">
            {/* Letterhead */}
            <div className="border-b-2 border-slate-800 pb-4 mb-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-base font-bold text-slate-900 font-serif">{fromHospital}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Patient Referral Letter</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">{today}</p>
                  <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mt-1 ${
                    urgency === "emergency" ? "bg-red-100 text-red-700" : urgency === "urgent" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {URGENCY_CONFIG[urgency].label}
                  </span>
                </div>
              </div>
            </div>

            {/* To block */}
            <div className="mb-5 text-sm font-serif text-slate-800 leading-relaxed">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans mb-1">To</p>
              <p className="font-semibold">{specialty} Department</p>
              <p>{selectedHospital?.name}</p>
              {(selectedHospital?.city || selectedHospital?.state) && (
                <p className="text-slate-500">{[selectedHospital?.city, selectedHospital?.state].filter(Boolean).join(", ")}</p>
              )}
            </div>

            {/* Patient block */}
            <div className="mb-5 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Patient</p>
              <p className="text-sm font-semibold text-slate-800 font-serif">
                {patientName}
                {patientAge ? `, ${patientAge} yrs` : ""}{patientSex ? `, ${patientSex}` : ""}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">{patientPhone}</p>
              {hospitalNumber && <p className="text-xs text-slate-400 mt-0.5">Hospital No: {hospitalNumber}</p>}
            </div>

            {diagnosis.trim() && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Provisional Diagnosis</p>
                <p className="text-sm font-serif text-slate-800">{diagnosis}</p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Clinical Note</p>
              <p className="text-[15px] leading-7 font-serif text-slate-800 whitespace-pre-wrap">{clinicalNote}</p>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[10px] text-slate-300 uppercase tracking-widest">Poveon Referral Network</p>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="text-xs font-semibold text-medical-600 hover:text-medical-700 transition-colors"
              >
                Edit note
              </button>
            </div>
          </div>

          {/* Doctor verification */}
          <div className="glass-card p-4 sm:p-5 space-y-4">
            <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-medical-600" />
              </div>
              Doctor Verification
            </h2>

            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-medical-50 border border-medical-100">
              <Info className="w-4 h-4 text-medical-500 shrink-0 mt-0.5" />
              <p className="text-xs text-medical-700 leading-relaxed">
                You don&apos;t need an account to write a referral — but to send one, your hospital must have
                registered your email on the referral network, and you confirm your identity with your
                doctor portal PIN.
              </p>
            </div>

            <Input
              label="Your doctor email"
              type="email"
              placeholder="doctor@hospital.com"
              value={doctorEmail}
              onChange={(e) => setDoctorEmail(e.target.value)}
              required
              autoComplete="email"
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">
                4-digit PIN
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
              </label>
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={4}
                  value={doctorPin}
                  onChange={(e) => setDoctorPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className="w-full rounded-xl border border-slate-200 hover:border-slate-300 bg-white/60 px-4 py-2.5 pr-10 text-sm tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                This is the PIN you use on the{" "}
                <Link href="/doc-login" className="text-medical-600 underline hover:text-medical-800">doctor portal</Link>.
              </p>
            </div>

            {sendError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-1.5">
                <p className="text-sm text-red-700 font-medium leading-relaxed">{sendError.message}</p>
                {sendError.kind === "auth" && (
                  <Link href="/doc-login" className="inline-block text-xs font-semibold text-red-700 underline hover:text-red-900">
                    Go to the doctor portal to set your PIN →
                  </Link>
                )}
                {sendError.kind === "registration" && (
                  <p className="text-xs text-red-600">
                    Ask your hospital&apos;s administrator to add your email from their referral dashboard, then try again.
                  </p>
                )}
              </div>
            )}

            <p className="text-xs text-slate-400 leading-relaxed">
              By sending, you confirm this referral is clinically accurate and agree to the{" "}
              <a href="/terms" className="underline hover:text-slate-600">Terms</a> &amp;{" "}
              <a href="/privacy" className="underline hover:text-slate-600">Privacy Policy</a>.
            </p>
          </div>
        </div>
      )}

      {/* ── Floating action bar ── */}
      {mounted && createPortal(
        <div className="fixed bottom-0 inset-x-0 z-[200] px-4 pb-6 pt-3 pointer-events-none">
          <div className="max-w-2xl mx-auto flex items-center gap-3 pointer-events-auto">
            {step > 1 && (
              <button
                type="button"
                onClick={() => { setStep(step - 1); window.scrollTo({ top: 0 }); }}
                className="flex items-center gap-1.5 px-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-all shadow-lg shadow-slate-900/5 shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!stepValid}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all"
              >
                Continue
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !canSend}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all"
              >
                {sending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {sending ? "Sending…" : "Send Referral"}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
