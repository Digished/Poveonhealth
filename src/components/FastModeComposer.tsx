"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  Zap, Building2, MapPin, Search, X, ChevronDown, RefreshCw, Loader2, Send, FlaskConical, Info,
  Check, ShieldCheck, Undo2, HelpCircle, AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { PrefixSelect } from "@/components/PrefixSelect";
import { SuccessScreen } from "@/components/SuccessScreen";
import { FastModeTutorial, FASTMODE_TUTORIAL_KEY } from "@/components/FastModeTutorial";
import type { Lab, CreateRequestResponse } from "@/lib/types";
import type { PhoneEntry } from "@/lib/phones";

const DOCTOR_STORAGE_KEY = "poveon_doctor_profile";
// Rolling average (ms) of how long a Fast Mode submit actually takes — drives an
// accurate countdown that adapts to this device/network instead of a fixed guess.
const ESTIMATE_KEY = "poveon_fastmode_est_ms";

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

/**
 * Fast Mode — the fastest path to a lab request. The doctor types the tests
 * (and optionally the patient details) in plain language and submits instantly;
 * a code is generated right away and the details are sorted into fields
 * server-side, in the background, for the lab. Nothing but the test text and the
 * doctor's email is required.
 */
export function FastModeComposer({
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

  const [labs, setLabs] = useState<Lab[]>(initialLabs ?? []);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labId, setLabId] = useState<string>(
    labPreselected && locations.length > 0 ? locations[defaultLocIdx].lab_id : (preselectedLabId ?? "")
  );
  const [selectedLocIdx, setSelectedLocIdx] = useState(defaultLocIdx);
  const [labPickerOpen, setLabPickerOpen] = useState(false);

  const [rawText, setRawText] = useState("");
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const [doctorEmail, setDoctorEmail] = useState("");
  const [doctorHospital, setDoctorHospital] = useState("");
  // When the doctor isn't recognised, collect their details once — exactly the
  // same fields as the full form (title + full name + hospital).
  const [doctorPrefix, setDoctorPrefix] = useState("Dr.");
  const [doctorName, setDoctorName] = useState("");
  // Cached doctor recognition (mirrors the full form's step 3).
  const [docStatus, setDocStatus] = useState<"idle" | "checking" | "recognized" | "unknown">("idle");
  const [docInfo, setDocInfo] = useState<{ prefix: string | null; name: string | null; hospital: string | null } | null>(null);
  // When the doctor's details come from cache we don't re-ask — show a chip instead.
  const [editingDoctor, setEditingDoctor] = useState(true);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false); // 1s undo window before the request fires
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds since submit started — drives the live progress
  const [estimateSec, setEstimateSec] = useState(30); // adaptive estimate for the countdown — starts at 30s, then learns the real time
  const [result, setResult] = useState<CreateRequestResponse | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Tick a live timer while submitting so the loading screen shows real progress
  // (steps + countdown) instead of an endless spinner.
  useEffect(() => {
    if (!submitting) { setElapsed(0); return; }
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), 100);
    return () => clearInterval(id);
  }, [submitting]);

  // Load the learned submit-duration estimate so the first countdown is realistic.
  useEffect(() => {
    try {
      const v = parseInt(localStorage.getItem(ESTIMATE_KEY) || "");
      if (v >= 6000 && v <= 30000) setEstimateSec(v / 1000);
    } catch { /* ignore */ }
  }, []);

  // First-run tutorial — auto-plays once, then cached. Replayable from the header.
  // We only autofocus the input when the tutorial is NOT showing, so the keyboard
  // doesn't pop up under (and hide) the tutorial on mobile.
  const [tutorialOpen, setTutorialOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(FASTMODE_TUTORIAL_KEY)) {
        setTutorialOpen(true);
        localStorage.setItem(FASTMODE_TUTORIAL_KEY, "1");
        return;
      }
    } catch { /* ignore */ }
    // Returning doctor (no tutorial) — focus the input for quick typing.
    setTimeout(() => rawRef.current?.focus(), 120);
  }, []);

  // Prefill the doctor's saved identity (same store the full form uses).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DOCTOR_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { email?: string; hospital?: string; prefix?: string; name?: string };
        if (p.email) {
          setDoctorEmail(p.email);
          // Already on file — don't re-ask; show it as an editable chip.
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) setEditingDoctor(false);
        }
        if (p.hospital) setDoctorHospital(p.hospital);
        if (p.prefix) setDoctorPrefix(p.prefix);
        if (p.name) setDoctorName(p.name);
      }
    } catch { /* ignore */ }
  }, []);

  // Lazy-load labs only when a picker is needed.
  useEffect(() => {
    if (labPreselected || (initialLabs && initialLabs.length > 0)) return;
    setLabsLoading(true);
    fetch("/api/labs").then((r) => r.json()).then((d) => setLabs(d.labs ?? []))
      .catch(() => toast.error("Failed to load laboratories"))
      .finally(() => setLabsLoading(false));
  }, [labPreselected, initialLabs]);

  // Recognise a registered doctor by email (same cached step-3 lookup as the full
  // form) so their hospital is auto-filled and they don't re-enter it.
  useEffect(() => {
    const email = doctorEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setDocStatus("idle"); setDocInfo(null); return; }
    setDocStatus("checking");
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/doc-profile/check?email=${encodeURIComponent(email)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d || !d.exists) { setDocStatus("unknown"); setDocInfo(null); return; }
          setDocInfo({ prefix: d.prefix ?? null, name: d.full_name ?? null, hospital: d.hospital ?? null });
          setDocStatus("recognized");
          if (d.hospital) setDoctorHospital((h) => h || d.hospital);
        })
        .catch(() => setDocStatus("idle"));
    }, 500);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [doctorEmail]);

  // Clean up a pending undo timer on unmount.
  useEffect(() => () => { if (pendingTimer.current) clearTimeout(pendingTimer.current); }, []);

  const selectedLab = labs.find((l) => l.id === labId);
  const selectedLoc = labPreselected && locations.length > 0 ? locations[selectedLocIdx] : null;
  const labName = selectedLoc?.name || selectedLab?.name || "";
  const labAddress = selectedLoc?.address || selectedLab?.address || "";

  // An unrecognised doctor must register (name + hospital) before submitting.
  const needsRegistration = docStatus === "unknown";
  const registrationValid = !needsRegistration || (doctorName.trim().length > 0 && doctorHospital.trim().length > 0);
  const canSubmit =
    !!labId &&
    rawText.trim().length >= 3 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doctorEmail.trim()) &&
    registrationValid;

  // Rough checks for a phone (7+ digit run) and an email in the typed text so we
  // can nudge the doctor to add them — phone lets the lab reach the patient, email
  // lets the code be sent to the patient.
  const phoneLikelyPresent = /\d{7,}/.test(rawText.replace(/[\s().+-]/g, ""));
  const emailLikelyPresent = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(rawText);

  // Tap submit → review/confirm first.
  function openConfirm() {
    if (!canSubmit) {
      if (!labId) toast.error("Choose the laboratory first.");
      else if (rawText.trim().length < 3) toast.error("Type the test(s) needed.");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doctorEmail.trim())) toast.error("Enter a valid email for your confirmation.");
      else if (needsRegistration && !registrationValid) toast.error("Add your name and hospital to register.");
      return;
    }
    setConfirmOpen(true);
  }

  // Confirm → 1-second undo window before the request actually fires.
  function confirmAndQueue() {
    setConfirmOpen(false);
    setPending(true);
    pendingTimer.current = setTimeout(() => { setPending(false); void actualSubmit(); }, 1200);
  }

  function undoSubmit() {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    setPending(false);
  }

  async function actualSubmit() {
    setSubmitting(true);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab_id: labId,
          fast_mode: true,
          raw_input: rawText.trim(),
          doctor_email: doctorEmail.trim(),
          doctor_hospital: doctorHospital.trim() || undefined,
          // New (unrecognised) doctor's registration details, when provided.
          doctor_prefix: needsRegistration ? doctorPrefix : undefined,
          doctor_name: needsRegistration && doctorName.trim() ? doctorName.trim() : undefined,
        }),
      });
      const data: CreateRequestResponse = await res.json();
      if (data.success) {
        // Learn how long submits actually take, but deliberately bias the shown
        // countdown LONGER (pad ~40% + 2s) so it tends to finish early rather than
        // run past the number. Clamped to 8–30s, starting from the 20s default.
        try {
          // Learn the real submit duration so the countdown is accurate. Only a
          // small safety margin (+10%) is added; the shown estimate converges to
          // the true time. Clamped 6–30s; first-ever guess is 30s.
          const durMs = Date.now() - t0;
          const padded = Math.round(durMs * 1.1) + 800;
          const prev = parseInt(localStorage.getItem(ESTIMATE_KEY) || "") || 30000;
          const next = Math.min(30000, Math.max(6000, Math.round(prev * 0.4 + padded * 0.6)));
          localStorage.setItem(ESTIMATE_KEY, String(next));
          setEstimateSec(next / 1000);
        } catch { /* ignore */ }
        try {
          const toSave: Record<string, string> = { email: doctorEmail.trim() };
          if (doctorHospital.trim()) toSave.hospital = doctorHospital.trim();
          if (doctorName.trim()) { toSave.name = doctorName.trim(); toSave.prefix = doctorPrefix; }
          localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify(toSave));
        } catch { /* ignore */ }
        setResult(data);
        window.scrollTo({ top: 0 });
      } else {
        toast.error(data.error ?? "Failed to submit. Please try again.");
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
        onReset={() => { setResult(null); setRawText(""); }}
      />
    );
  }

  if (submitting) {
    const EST = estimateSec; // learned from past submits on this device
    const STEPS = [
      { label: "Generating your code", at: 0 },
      { label: "Sorting the patient details", at: EST * 0.22 },
      { label: "Pricing & matching the lab catalogue", at: EST * 0.5 },
      { label: "Notifying the lab", at: EST * 0.8 },
    ];
    const stage = STEPS.reduce((acc, s, i) => (elapsed >= s.at ? i : acc), 0);
    const remaining = Math.max(0, EST - elapsed);
    const pct = Math.min(95, (elapsed / EST) * 100);
    const overdue = remaining <= 0.4;

    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 animate-fade-in min-h-[320px]">
        {/* Countdown ring */}
        <div className="relative w-24 h-24 mb-5">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke="#e2e8f0" strokeWidth="7" />
            <circle
              cx="50" cy="50" r="44" fill="none" stroke="#0259a0" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 44}
              strokeDashoffset={(2 * Math.PI * 44) * (1 - pct / 100)}
              style={{ transition: "stroke-dashoffset 0.2s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {overdue ? (
              <Loader2 className="w-6 h-6 text-medical-600 animate-spin" />
            ) : (
              <>
                <span className="text-2xl font-black text-slate-800 leading-none">{Math.ceil(remaining)}</span>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">sec</span>
              </>
            )}
          </div>
        </div>

        <p className="text-base font-bold text-slate-800">{overdue ? "Almost there…" : "Submitting your request"}</p>
        <p className="text-xs text-slate-400 mb-5">{overdue ? "Wrapping up" : "This usually takes a few seconds"}</p>

        {/* Live steps */}
        <div className="w-full max-w-xs space-y-2">
          {STEPS.map((s, i) => {
            const done = i < stage || (overdue && i <= stage);
            const active = i === stage && !overdue;
            return (
              <div
                key={s.label}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-500 ${
                  done ? "bg-emerald-50 border-emerald-100" : active ? "bg-medical-50 border-medical-100" : "bg-slate-50 border-slate-100 opacity-50"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500" : active ? "bg-medical-100" : "bg-slate-200"}`}>
                  {done ? <Check className="w-3 h-3 text-white" /> : active ? <Loader2 className="w-3 h-3 text-medical-600 animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                </span>
                <span className={`text-sm font-medium ${done ? "text-emerald-700" : active ? "text-slate-800" : "text-slate-400"}`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-28">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-medical-600 text-white text-xs font-bold shadow-sm shadow-medical-600/30">
            <Zap className="w-3.5 h-3.5" /> Fast mode
          </span>
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-medical-600 hover:text-medical-800 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" /> How it works
          </button>
        </div>
        {onExit && (
          <button type="button" onClick={onExit} className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline underline-offset-2">
            Use full form
          </button>
        )}
      </div>

      <FastModeTutorial open={tutorialOpen} onClose={() => { setTutorialOpen(false); setTimeout(() => rawRef.current?.focus(), 120); }} />

      {/* Lab selector */}
      {labPreselected ? (
        <div className="mt-2 rounded-2xl bg-medical-50 border border-medical-100 px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-medical-100 flex items-center justify-center shrink-0"><Building2 className="w-4 h-4 text-medical-600" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-medical-900 truncate">{labName}</p>
            {labAddress && <p className="text-xs text-medical-600 flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{labAddress}</p>}
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
        <button
          type="button"
          onClick={() => setLabPickerOpen(true)}
          className={`mt-2 w-full rounded-2xl border px-4 py-3 flex items-center gap-2.5 text-left transition-all ${selectedLab ? "border-medical-300 bg-medical-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
        >
          {selectedLab ? (
            <>
              {selectedLab.logo_url ? <img src={selectedLab.logo_url} alt={selectedLab.name} className="w-7 h-7 rounded-lg object-cover shrink-0" /> : <Building2 className="w-5 h-5 text-medical-600 shrink-0" />}
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
      )}

      {/* Step 1 — the request, in plain language */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-medical-50 flex items-center justify-center shrink-0"><FlaskConical className="w-4 h-4 text-medical-600" /></div>
          <h2 className="text-sm font-bold text-slate-800">What does the patient need?</h2>
        </div>
        <textarea
          ref={rawRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={4}
          placeholder="e.g. Headache, nipple discharge, Brain CT scan for Mrs Okafor, 38, 0801 234 5678, query prolactinoma"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] leading-7 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 resize-none"
        />
        <div className="flex items-start gap-2 mt-2">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Just the test is required. Add the patient name, age, phone or email if you have them — we separate the tests and sort the details for the lab automatically. You can leave anything out.
          </p>
        </div>
      </div>

      {/* The doctor's details are auto-filled from the saved profile — only a
          first-time doctor (no cache) is asked, and only once. */}
      {!editingDoctor && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doctorEmail.trim()) ? (
        <div className="mt-4 flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-emerald-50 border border-emerald-100">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-800 truncate">
              {docInfo?.name ? `Submitting as ${[docInfo.prefix, docInfo.name].filter(Boolean).join(" ")}` : `Submitting as ${doctorEmail.trim()}`}
            </p>
            <p className="text-[11px] text-emerald-600/80 truncate">
              {docStatus === "checking" ? "Confirming your saved details…" : `Your saved details${docInfo?.hospital ? ` · ${docInfo.hospital}` : ""} are used automatically.`}
            </p>
          </div>
          <button type="button" onClick={() => setEditingDoctor(true)} className="text-xs font-semibold text-emerald-700 underline underline-offset-2 shrink-0">Change</button>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-bold text-slate-800">Your details</h2>
          <Input
            label="Your email"
            type="email"
            placeholder="you@hospital.com"
            value={doctorEmail}
            onChange={(e) => setDoctorEmail(e.target.value)}
            required
            autoComplete="email"
            hint="Asked once — we remember it next time."
          />
          {docStatus === "checking" && (
            <p className="flex items-center gap-2 text-xs text-slate-400"><RefreshCw className="w-3 h-3 animate-spin" /> Checking your profile…</p>
          )}
          {docStatus === "recognized" && docInfo ? (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-800 truncate">
                  Recognised{docInfo.name ? ` as ${[docInfo.prefix, docInfo.name].filter(Boolean).join(" ")}` : ""}
                </p>
                {docInfo.hospital && <p className="text-xs text-emerald-600 truncate">{docInfo.hospital}</p>}
                <p className="text-[11px] text-emerald-600/80 mt-0.5">Your saved details are filled in automatically.</p>
              </div>
            </div>
          ) : docStatus === "unknown" ? (
            /* New doctor — same fields as the full form: title + full name + hospital. */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <PrefixSelect value={doctorPrefix || "Dr."} onChange={(prefix) => setDoctorPrefix(prefix)} />
                </div>
                <div className="sm:col-span-3">
                  <Input
                    label="Full Name"
                    placeholder="e.g. Chioma Okafor"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    required
                  />
                </div>
              </div>
              {doctorName.trim() && (
                <Input
                  label="Hospital / Clinic"
                  placeholder="e.g. Lagos University Teaching Hospital"
                  value={doctorHospital}
                  onChange={(e) => setDoctorHospital(e.target.value)}
                  required
                />
              )}
            </div>
          ) : (
            <Input
              label="Hospital / clinic (optional)"
              placeholder="e.g. Lagos University Teaching Hospital"
              value={doctorHospital}
              onChange={(e) => setDoctorHospital(e.target.value)}
            />
          )}
        </div>
      )}

      {/* Submit bar — becomes an Undo bar during the 1s grace window */}
      {mounted && createPortal(
        <div className="fixed bottom-0 inset-x-0 z-[200] px-4 pb-6 pt-3 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            {pending ? (
              <button
                type="button"
                onClick={undoSubmit}
                className="relative w-full overflow-hidden flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-slate-800 text-white font-bold text-sm shadow-xl transition-all"
              >
                <span className="absolute left-0 bottom-0 h-1 bg-medical-400/80 animate-[fastmode-progress_1.2s_linear_forwards]" />
                <Undo2 className="w-5 h-5" /> Sending… tap to undo
              </button>
            ) : (
              <button
                type="button"
                onClick={openConfirm}
                disabled={!canSubmit}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/35 transition-all"
              >
                <Send className="w-5 h-5" /> Submit &amp; get code
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Confirmation sheet */}
      {mounted && confirmOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setConfirmOpen(false)} />
          <div className="relative w-full sm:w-[460px] sm:mx-4 bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl animate-slide-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-medical-600" />
              <h2 className="text-base font-semibold text-slate-800">Confirm Fast Mode request</h2>
            </div>
            <div className="px-5 py-4 space-y-3 max-h-[55vh] overflow-y-auto">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Laboratory</p>
                <p className="text-sm font-semibold text-slate-800">{labName || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">What you typed</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 mt-1">{rawText.trim()}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Your email</p>
                <p className="text-sm font-medium text-slate-800">{doctorEmail.trim()}</p>
              </div>
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-medical-50 border border-medical-100">
                <Info className="w-4 h-4 text-medical-500 shrink-0 mt-0.5" />
                <p className="text-xs text-medical-700 leading-relaxed">Submitting generates a code now. The patient details are sorted for the lab in the background.</p>
              </div>

              {(!emailLikelyPresent || !phoneLikelyPresent) && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-800">Add the patient&apos;s contact if you can</p>
                    <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc pl-4 leading-relaxed">
                      {!emailLikelyPresent && <li>Their <span className="font-semibold">email</span> — so the code can be sent to the patient</li>}
                      {!phoneLikelyPresent && <li>Their <span className="font-semibold">phone</span> — so the lab can reach the patient</li>}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
              {(!emailLikelyPresent || !phoneLikelyPresent) ? (
                <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-700 font-semibold text-sm hover:bg-amber-100 transition">Go back &amp; add</button>
              ) : (
                <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition">Cancel</button>
              )}
              <button type="button" onClick={confirmAndQueue} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 text-white font-bold text-sm transition shadow-sm">
                <Check className="w-4 h-4" /> {(!emailLikelyPresent || !phoneLikelyPresent) ? "Submit anyway" : "Looks good — submit"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {mounted && labPickerOpen && createPortal(
        <LabPickerModal labs={labs} loading={labsLoading} selectedId={labId} onSelect={(id) => { setLabId(id); setLabPickerOpen(false); }} onClose={() => setLabPickerOpen(false)} />,
        document.body
      )}
    </div>
  );
}

function LabPickerModal({ labs, loading, selectedId, onSelect, onClose }: {
  labs: Lab[]; loading: boolean; selectedId: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 80); return () => clearTimeout(t); }, []);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? labs.filter((l) => l.name.toLowerCase().includes(q) || (l.address ?? "").toLowerCase().includes(q)) : labs;

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
            <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or location…" className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400" />
          </div>
        </div>
        <ul className="overflow-y-auto overscroll-contain">
          {loading ? (
            <li className="px-5 py-8 text-sm text-slate-400 text-center flex flex-col items-center gap-2"><RefreshCw className="w-5 h-5 animate-spin text-slate-300" /> Loading…</li>
          ) : filtered.length === 0 ? (
            <li className="px-5 py-8 text-sm text-slate-400 text-center">No laboratories found</li>
          ) : filtered.map((lab) => (
            <li key={lab.id}>
              <button type="button" onClick={() => onSelect(lab.id)} className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${lab.id === selectedId ? "bg-medical-50" : "hover:bg-slate-50"}`}>
                {lab.logo_url ? <img src={lab.logo_url} alt={lab.name} className="w-10 h-10 rounded-xl object-cover shrink-0" /> : <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5 text-medical-600" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{lab.name}</p>
                  {lab.address && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{lab.address}</p>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
