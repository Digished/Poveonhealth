"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  Mic, MicOff, Send, Loader2, Building2, MapPin, Search, X,
  ChevronDown, RefreshCw, Wand2, Stethoscope, Info, Zap, Keyboard,
} from "lucide-react";
import { Input, Textarea } from "@/components/ui/Input";
import { PhoneInput } from "@/components/PhoneInput";
import { TestTagInput, type TestTag } from "@/components/ui/TestTagInput";
import { SuccessScreen } from "@/components/SuccessScreen";
import type { Lab, CreateRequestResponse } from "@/lib/types";
import type { PhoneEntry } from "@/lib/phones";

const DOCTOR_STORAGE_KEY = "poveon_doctor_profile";

interface Location {
  lab_id: string;
  lab_branch_id: string | null;
  name: string;
  address: string;
  phones: PhoneEntry[];
  whatsapp?: string | null;
  logo_url?: string | null;
  is_main: boolean;
  is_parent: boolean;
}

interface ParsedReferral {
  tests: string[];
  diagnosis: string;
  patient_name: string;
  patient_age: number | null;
  dob: string;
  sex: "male" | "female" | "";
  patient_phone: string;
  schedule_hint: "today" | "this_week" | "this_month" | "";
}

type ResolvedTest = { input: string; status: "resolved" | "ambiguous" | "unknown"; canonical?: string };

// Minimal typing for the Web Speech API (not in lib.dom for all targets).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Build test pills from the parser output, flagging anything the lab catalog
// did not recognise so the doctor can eyeball it before sending.
function toTestTags(names: string[], resolved: ResolvedTest[] | null): TestTag[] {
  const byInput = new Map((resolved ?? []).map((r) => [r.input.toLowerCase(), r]));
  const seen = new Set<string>();
  const tags: TestTag[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const match = byInput.get(name.toLowerCase());
    const inCatalog = match ? match.status !== "unknown" : false;
    tags.push({
      name: match?.canonical || name,
      catalog_test_id: null,
      low_confidence: !inCatalog,
    });
  }
  return tags;
}

export function FastReferralComposer({
  preselectedLabId,
  locations = [],
  initialLabs,
  onExit,
}: {
  preselectedLabId?: string;
  preselectedLabName?: string;
  locations?: Location[];
  initialLabs?: Lab[];
  onExit?: () => void;
}) {
  const labPreselected = !!preselectedLabId;
  const hasLocations = locations.length > 1;
  const defaultLocIdx = locations.length > 0 ? Math.max(0, locations.findIndex((l) => l.is_main)) : 0;

  // ── Lab selection ─────────────────────────────────────────────────────────
  const [labs, setLabs] = useState<Lab[]>(initialLabs ?? []);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labId, setLabId] = useState<string>(
    labPreselected && locations.length > 0 ? locations[defaultLocIdx].lab_id : (preselectedLabId ?? "")
  );
  const [selectedLocIdx, setSelectedLocIdx] = useState(defaultLocIdx);
  const [labPickerOpen, setLabPickerOpen] = useState(false);

  // ── Dictation ─────────────────────────────────────────────────────────────
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported = typeof window !== "undefined" && !!getSpeechRecognition();

  // ── Parse state ───────────────────────────────────────────────────────────
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);

  // ── Referral fields ───────────────────────────────────────────────────────
  const [testTags, setTestTags] = useState<TestTag[]>([]);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientSex, setPatientSex] = useState<"" | "male" | "female">("");
  const [diagnosis, setDiagnosis] = useState("");
  const [schedule, setSchedule] = useState<ParsedReferral["schedule_hint"]>("");

  // ── Doctor identity ───────────────────────────────────────────────────────
  const [doctorEmail, setDoctorEmail] = useState("");
  const [doctorHospital, setDoctorHospital] = useState("");

  // ── Submit ────────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateRequestResponse | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Prefill doctor identity from the same localStorage profile the stepper uses.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCTOR_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { email?: string; hospital?: string };
        if (p.email) setDoctorEmail(p.email);
        if (p.hospital) setDoctorHospital(p.hospital);
      }
    } catch { /* ignore */ }
  }, []);

  // Lazy-load labs only when needed (home page, no preselection, none provided).
  useEffect(() => {
    if (labPreselected || (initialLabs && initialLabs.length > 0)) return;
    setLabsLoading(true);
    fetch("/api/labs")
      .then((r) => r.json())
      .then((d) => setLabs(d.labs ?? []))
      .catch(() => toast.error("Failed to load laboratories"))
      .finally(() => setLabsLoading(false));
  }, [labPreselected, initialLabs]);

  // Clean up any live recognition on unmount.
  useEffect(() => () => { try { recognitionRef.current?.stop(); } catch { /* ignore */ } }, []);

  const selectedLab = labs.find((l) => l.id === labId);
  const selectedLoc = labPreselected && locations.length > 0 ? locations[selectedLocIdx] : null;
  const labName = selectedLoc?.name || selectedLab?.name || "";
  const labAddress = selectedLoc?.address || selectedLab?.address || "";

  // ── Voice control ─────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) { toast.error("Voice input isn't supported on this browser — type instead."); return; }
    try {
      const rec = new Ctor();
      rec.lang = "en-NG";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let finalChunk = "";
        let interimChunk = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalChunk += res[0].transcript;
          else interimChunk += res[0].transcript;
        }
        if (finalChunk) {
          setTranscript((prev) => (prev ? `${prev} ${finalChunk}`.replace(/\s+/g, " ") : finalChunk).trim());
          setInterim("");
        } else {
          setInterim(interimChunk);
        }
      };
      rec.onerror = (ev) => {
        if (ev.error !== "aborted" && ev.error !== "no-speech") {
          toast.error(ev.error === "not-allowed" ? "Microphone permission denied." : "Voice input error — type instead.");
        }
        setListening(false);
      };
      rec.onend = () => { setListening(false); setInterim(""); };
      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      toast.error("Couldn't start the microphone.");
      setListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  // ── Parse ─────────────────────────────────────────────────────────────────
  async function handleParse() {
    if (listening) stopListening();
    const text = `${transcript} ${interim}`.trim();
    if (text.length < 3) { toast.error("Dictate or type the referral first."); return; }
    setParsing(true);
    try {
      const res = await fetch("/api/requests/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, labId: labId || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Couldn't understand that. Try again or fill the fields below.");
        setParsed(true); // still reveal the fields so they can type
        return;
      }
      const p = data.parsed as ParsedReferral;
      const resolved = (data.resolvedTests as ResolvedTest[] | null) ?? null;
      if (p.tests.length) setTestTags((prev) => (prev.length ? prev : toTestTags(p.tests, resolved)));
      if (p.patient_name) setPatientName((v) => v || p.patient_name);
      if (p.patient_phone) setPatientPhone((v) => v || p.patient_phone);
      if (p.patient_age) setPatientAge((v) => v || String(p.patient_age));
      if (p.sex) setPatientSex((v) => v || p.sex);
      if (p.diagnosis) setDiagnosis((v) => v || p.diagnosis);
      if (p.schedule_hint) setSchedule(p.schedule_hint);
      setParsed(true);
      const flagged = (resolved ?? []).filter((r) => r.status === "unknown").length;
      toast.success(flagged > 0 ? `Done — check ${flagged} test${flagged > 1 ? "s" : ""} not in this lab's catalog.` : "Referral built — review and send.");
    } catch {
      toast.error("Network error. You can still fill the fields below.");
      setParsed(true);
    } finally {
      setParsing(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const canSend =
    !!labId &&
    testTags.length > 0 &&
    patientName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doctorEmail.trim());

  async function handleSend() {
    if (!canSend) return;
    setSubmitting(true);
    try {
      // Preserve a stated age even though the request model only stores DOB:
      // approximate to 1 Jan of the birth year.
      let dob = "";
      const ageNum = parseInt(patientAge, 10);
      if (!Number.isNaN(ageNum) && ageNum > 0 && ageNum < 130) {
        dob = `${new Date().getFullYear() - ageNum}-01-01`;
      }
      const res = await fetch("/api/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab_id: labId,
          tests: testTags.map((t) => t.name).join("\n"),
          patient_name: patientName.trim(),
          patient_phone: patientPhone.trim() || undefined,
          dob: dob || undefined,
          sex: patientSex || undefined,
          diagnosis: diagnosis.trim() || undefined,
          schedule: schedule || undefined,
          doctor_email: doctorEmail.trim(),
          doctor_hospital: doctorHospital.trim() || undefined,
        }),
      });
      const data: CreateRequestResponse = await res.json();
      if (data.success) {
        try {
          const toSave: Record<string, string> = { email: doctorEmail.trim() };
          if (doctorHospital.trim()) toSave.hospital = doctorHospital.trim();
          localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify(toSave));
        } catch { /* ignore */ }
        setResult(data);
        window.scrollTo({ top: 0 });
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
        requestId={result.requestId}
        labName={result.lab?.name ?? labName}
        labAddress={result.lab?.address ?? labAddress}
        labPhones={result.lab?.phones ?? []}
        labWhatsapp={result.lab?.whatsapp ?? null}
        onReset={() => {
          setResult(null);
          setTranscript(""); setInterim(""); setParsed(false);
          setTestTags([]); setPatientName(""); setPatientPhone("");
          setPatientAge(""); setPatientSex(""); setDiagnosis(""); setSchedule("");
        }}
      />
    );
  }

  const liveText = `${transcript}${interim ? ` ${interim}` : ""}`.trim();

  return (
    <div className="animate-fade-in pb-32">
      {/* ── Header / mode switch ── */}
      <div className="flex items-center justify-between gap-2 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-medical-600 text-white text-xs font-bold shadow-sm shadow-medical-600/30">
            <Zap className="w-3.5 h-3.5" /> Fast mode
          </span>
        </div>
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            Use step-by-step form
          </button>
        )}
      </div>

      {/* ── Lab selector ── */}
      {labPreselected ? (
        <div className="mt-2 rounded-2xl bg-medical-50 border border-medical-100 px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
            <Building2 className="w-4 h-4 text-medical-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-medical-900 truncate">{labName}</p>
            {labAddress && (
              <p className="text-xs text-medical-600 flex items-center gap-1 mt-0.5 truncate">
                <MapPin className="w-3 h-3 shrink-0" />{labAddress}
              </p>
            )}
          </div>
          {hasLocations && (
            <select
              value={selectedLocIdx}
              onChange={(e) => { const i = parseInt(e.target.value, 10); setSelectedLocIdx(i); setLabId(locations[i].lab_id); }}
              className="text-xs rounded-lg border border-medical-200 bg-white px-2 py-1.5 text-medical-700 focus:outline-none focus:ring-2 focus:ring-medical-400"
            >
              {locations.map((l, i) => <option key={l.lab_id + i} value={i}>{l.name}</option>)}
            </select>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setLabPickerOpen(true)}
            className={`w-full rounded-2xl border px-4 py-3 flex items-center gap-2.5 text-left transition-all ${
              selectedLab ? "border-medical-300 bg-medical-50" : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            {selectedLab ? (
              <>
                {selectedLab.logo_url ? (
                  <img src={selectedLab.logo_url} alt={selectedLab.name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                ) : (
                  <Building2 className="w-5 h-5 text-medical-600 shrink-0" />
                )}
                <span className="text-sm font-semibold text-medical-800 truncate flex-1">{selectedLab.name}</span>
                <ChevronDown className="w-4 h-4 text-medical-400 shrink-0" />
              </>
            ) : (
              <>
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm text-slate-400 flex-1">{labsLoading ? "Loading laboratories…" : "Choose the laboratory…"}</span>
                {labsLoading && <RefreshCw className="w-3.5 h-3.5 text-slate-300 animate-spin shrink-0" />}
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Dictation surface ── */}
      <div className="mt-4">
        <div className="rounded-2xl border-2 border-medical-100 bg-gradient-to-b from-white to-medical-50/30 p-4">
          <div className="flex items-start gap-2 mb-3">
            <Info className="w-4 h-4 text-medical-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Say or type the whole thing in plain English — patient, age, the tests, and why.
              <span className="block text-slate-400 mt-0.5 italic">
                e.g. “FBC, malaria parasite and widal for Mrs Okafor, 42, query typhoid”
              </span>
            </p>
          </div>

          <Textarea
            value={liveText}
            onChange={(e) => { setTranscript(e.target.value); setInterim(""); }}
            placeholder="Tap the mic and speak, or type here…"
            rows={4}
            className="text-[15px] leading-7"
          />

          <div className="flex items-center gap-2 mt-3">
            {speechSupported && (
              <button
                type="button"
                onClick={listening ? stopListening : startListening}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                  listening
                    ? "bg-red-600 text-white shadow-lg shadow-red-600/30 animate-pulse"
                    : "bg-white border border-medical-200 text-medical-700 hover:bg-medical-50"
                }`}
              >
                {listening ? <><MicOff className="w-4 h-4" /> Stop</> : <><Mic className="w-4 h-4" /> Speak</>}
              </button>
            )}
            <button
              type="button"
              onClick={handleParse}
              disabled={parsing || liveText.length < 3}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-medical-600 to-indigo-600 text-white text-sm font-bold shadow-sm shadow-medical-600/30 hover:from-medical-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {parsing ? "Building…" : parsed ? "Re-build from text" : "Build referral"}
            </button>
          </div>
          {!speechSupported && (
            <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
              <Keyboard className="w-3 h-3" /> Voice input isn’t available on this browser — typing works the same.
            </p>
          )}
        </div>
      </div>

      {/* ── Review & confirm (revealed after first parse) ── */}
      {parsed && (
        <div className="mt-5 space-y-4 animate-fade-in-up">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <Stethoscope className="w-4 h-4 text-medical-600" /> Review &amp; send
          </h3>

          <TestTagInput
            value={testTags}
            onChange={setTestTags}
            labId={labId || undefined}
            label="Tests"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Patient name"
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
                placeholder="42"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Sex</label>
                <select
                  value={patientSex}
                  onChange={(e) => setPatientSex(e.target.value as typeof patientSex)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
                >
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
          </div>

          <PhoneInput
            label="Patient phone (for their result SMS)"
            value={patientPhone}
            onChange={setPatientPhone}
          />

          <Textarea
            label="Clinical note / diagnosis"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="e.g. ?Typhoid fever, 5-day history of fever…"
            rows={2}
          />

          <div className="pt-1 border-t border-slate-100" />

          <Input
            label="Your email"
            type="email"
            placeholder="you@hospital.com"
            value={doctorEmail}
            onChange={(e) => setDoctorEmail(e.target.value)}
            required
            autoComplete="email"
            hint="Your confirmation is sent here. Registered doctors are auto-filled."
          />
          <Input
            label="Hospital / clinic (optional)"
            placeholder="e.g. Lagos University Teaching Hospital"
            value={doctorHospital}
            onChange={(e) => setDoctorHospital(e.target.value)}
          />
        </div>
      )}

      {/* ── Floating send bar ── */}
      {mounted && parsed && createPortal(
        <div className="fixed bottom-0 inset-x-0 z-[200] px-4 pb-6 pt-3 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={handleSend}
              disabled={submitting || !canSend}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {submitting ? "Sending…" : "Send to lab"}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Lab picker modal ── */}
      {mounted && labPickerOpen && createPortal(
        <LabPickerModal
          labs={labs}
          loading={labsLoading}
          selectedId={labId}
          onSelect={(id) => { setLabId(id); setLabPickerOpen(false); }}
          onClose={() => setLabPickerOpen(false)}
        />,
        document.body
      )}
    </div>
  );
}

// ─── Lightweight lab picker (bottom sheet on mobile, dialog on desktop) ────────
function LabPickerModal({
  labs, loading, selectedId, onSelect, onClose,
}: {
  labs: Lab[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 80); return () => clearTimeout(t); }, []);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? labs.filter((l) => l.name.toLowerCase().includes(q) || (l.address ?? "").toLowerCase().includes(q))
    : labs;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:w-[460px] sm:mx-4 bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[600px] animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Select laboratory</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or location…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
            />
          </div>
        </div>
        <ul className="overflow-y-auto overscroll-contain">
          {loading ? (
            <li className="px-5 py-8 text-sm text-slate-400 text-center flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-slate-300" /> Loading…
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-5 py-8 text-sm text-slate-400 text-center">No laboratories found</li>
          ) : (
            filtered.map((lab) => (
              <li key={lab.id}>
                <button
                  type="button"
                  onClick={() => onSelect(lab.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${lab.id === selectedId ? "bg-medical-50" : "hover:bg-slate-50"}`}
                >
                  {lab.logo_url ? (
                    <img src={lab.logo_url} alt={lab.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5 text-medical-600" /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{lab.name}</p>
                    {lab.address && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{lab.address}</p>}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
