"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { startOfDay, startOfWeek, startOfMonth, startOfYear } from "date-fns";
import { Loader2, Search, X, ArrowRight, Plus, Workflow, UserPlus, Printer, Send, Check, FlaskConical, Pencil, Stethoscope, AlertTriangle, CreditCard, Lock, Bell, Calendar as CalendarIcon, MapPin, Clock, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { SourceBadge } from "@/components/lab/SourceBadge";
import { LabOnboardForm } from "@/components/lab/LabOnboardForm";
import { StatCard } from "@/components/lab/StatCard";
import { TestTagInput, TestTag } from "@/components/ui/TestTagInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FullViewModal } from "@/components/ui/FullViewModal";
import { Calendar } from "@/components/ui/Calendar";
import { ScheduleCalendar } from "@/components/lab/ScheduleCalendar";
import { useLabTour } from "@/components/lab/tour/TourProvider";
import { requestDepartments, breakdownItemDepartment, WORKFLOWS, stageLabel, stageColorClasses, stageDurations, formatDuration, awaitingPhrase, awaitingLabel, DEFAULT_DEPARTMENTS, type DepartmentConfig } from "@/lib/lims-shared";
import { nextPendingAction, directToDepartments, type PendingAction } from "@/lib/lab-pending";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Compact day + time, e.g. "Mar 5, 2:30 PM" — used for milestone timestamps. */
function fmtDayTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Relative "time since", e.g. "just now", "3 hours ago", "2 days ago". */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Human label for a request's registration status (the client-facing wording). */
function statusLabel(status: string): string {
  if (status === "incoming") return "Unregistered";
  if (status === "seen") return "Registered";
  if (status === "done") return "Done";
  return status;
}

/** Format a Naira amount, e.g. 12500 → "₦12,500". */
function fmtNaira(n: number): string {
  return "₦" + Math.round(n).toLocaleString();
}

/** Per-test cost rows (+ total) for a request, derived from its resolved breakdown. */
function costBreakdown(r: WReq): { rows: { name: string; price: number | null }[]; total: number } {
  const items = Array.isArray(r.test_breakdown)
    ? (r.test_breakdown as { raw?: string; canonical_name?: string; unit_price?: number }[])
    : [];
  const rows = items
    .map((it) => ({ name: it.canonical_name || it.raw || "", price: typeof it.unit_price === "number" ? it.unit_price : null }))
    .filter((x) => x.name);
  const total = rows.reduce((s, x) => s + (x.price ?? 0), 0);
  return { rows, total };
}

interface JEvent { id: string; stage: string; department: string | null; sample_label: string | null; note: string | null; actor_email: string | null; created_at: string }
interface WReq {
  id: string; code: string; status: string; source: string; current_stage: string | null;
  patient_name: string | null; patient_phone: string | null; patient_email: string | null;
  patient_age: number | null; sex: string | null;
  doctor_prefix: string | null; doctor_name: string | null; doctor_email: string | null;
  doctor_phone: string | null; doctor_hospital: string | null; tests: string;
  raw_input: string | null; diagnosis: string | null;
  is_paid: boolean; tests_confirmed: boolean;
  created_at: string; seen_at: string | null; completed_at: string | null;
  test_breakdown: unknown; journey_events: JEvent[];
}

interface TestPill { name: string; recognized: boolean }

/** Derive display pills for a request's tests, flagging catalog-recognized ones. */
function testPills(r: WReq): TestPill[] {
  const items = Array.isArray(r.test_breakdown) ? (r.test_breakdown as { raw?: string; canonical_name?: string; source?: string }[]) : [];
  if (items.length > 0) {
    return items.map((it) => ({ name: it.canonical_name || it.raw || "", recognized: it.source === "lab_catalog" })).filter((p) => p.name);
  }
  return (r.tests || "").split(",").map((s) => s.trim()).filter(Boolean).map((name) => ({ name, recognized: false }));
}
interface Track { department: string; workflow: string; currentStage: string; events: JEvent[]; collections: JEvent[]; tests: string[] }
interface ResultTemplate { id: string; name: string; department: string | null; parameters: { name: string; unit?: string; reference_range?: string; group?: string }[] }
interface RResult { id: string; request_id: string; department: string | null; status: string; values: { name: string; value?: string; unit?: string; reference_range?: string; group?: string; flag?: string }[]; comment: string | null; pdf_url: string | null }

function tracksFor(r: WReq, departments: DepartmentConfig[] = DEFAULT_DEPARTMENTS): Track[] {
  const depts = requestDepartments(r.test_breakdown, departments);
  const items = Array.isArray(r.test_breakdown)
    ? (r.test_breakdown as { category?: string | null; raw?: string; canonical_name?: string }[])
    : [];
  return depts.map(({ department, workflow }) => {
    const events = r.journey_events.filter((e) => e.department === department);
    const last = events[events.length - 1];
    const tests = items
      .filter((it) => breakdownItemDepartment(it, departments).department === department)
      .map((it) => it.canonical_name || it.raw || "")
      .filter(Boolean);
    return {
      department,
      workflow,
      currentStage: last?.stage ?? "registered",
      events,
      collections: events.filter((e) => e.stage === "collected"),
      tests,
    };
  });
}

/**
 * Per-milestone action config. Every stage advance opens a short action sheet
 * that captures the relevant detail (who/what/when) rather than blindly moving
 * the track forward. "collected" is handled separately by the sample picker.
 */
const MILESTONE_ACTIONS: Record<string, { cta: string; title: string; field: string; placeholder: string; required?: boolean; prompt: string }> = {
  scheduled:   { cta: "Schedule",       title: "Schedule appointment", field: "Date / time",            placeholder: "e.g. Tue 10:00am",            required: true, prompt: "When is the patient scheduled to come in?" },
  received:    { cta: "Mark received",  title: "Specimen received",    field: "Received by / condition", placeholder: "e.g. Received in good condition",                prompt: "Confirm the specimen has arrived in the lab." },
  performed:   { cta: "Mark performed", title: "Procedure performed",  field: "Scan / procedure done",   placeholder: "e.g. Chest X-ray PA view done", required: true, prompt: "Record the scan or procedure that was performed." },
  in_analysis: { cta: "Start analysis", title: "Begin analysis",       field: "Analyst / instrument",    placeholder: "e.g. Analyst: J. Doe",                          prompt: "Record who or what is running the analysis." },
  verified:    { cta: "Verify",         title: "Verify results",       field: "Note (optional)",         placeholder: "Reviewed & verified",                           prompt: "Confirm the results have been checked and are correct." },
  reported:    { cta: "Mark reported",  title: "Mark reported",        field: "Note (optional)",         placeholder: "Results delivered",                             prompt: "Confirm the report has been delivered to the patient." },
};

/** Canonical stage ordering across all workflows (for per-stage stat cards). */
const STAGE_ORDER = ["registered", "collected", "received", "in_analysis", "scheduled", "performed", "verified"] as const;

/** Time-window filter for the registration / pipeline lists. */
type PeriodKey = "all" | "today" | "week" | "month" | "year";
function periodStart(p: PeriodKey): number | null {
  const now = new Date();
  switch (p) {
    case "today": return startOfDay(now).getTime();
    case "week": return startOfWeek(now).getTime();
    case "month": return startOfMonth(now).getTime();
    case "year": return startOfYear(now).getTime();
    default: return null;
  }
}

/** StatCard accent for a pipeline stage. */
function stageAccent(stage: string): "amber" | "violet" | "emerald" | "medical" {
  if (stage === "registered") return "amber";
  if (stage === "verified") return "emerald";
  if (stage === "scheduled") return "medical";
  return "violet";
}

/** Small pulsing "action needed" chip telling staff the next step for a request. */
function PendingBadge({ action }: { action: PendingAction }) {
  return (
    <span className="inline-flex animate-pending-pulse items-center gap-1 rounded-full bg-medical-600/25 px-2 py-0.5 text-[10px] font-semibold text-medical-200 ring-1 ring-medical-400/50">
      <ArrowRight className="h-3 w-3" /> {action.label}
    </span>
  );
}

export function Workspace({
  labId,
  labName,
  labSlug,
  canAdvance,
  canEnterResults,
  canSendResults,
  memberDepartment,
  mode = "workstation",
  lite = false,
}: {
  labId: string;
  labName: string;
  labSlug: string | null;
  canAdvance: boolean;
  canEnterResults: boolean;
  canSendResults: boolean;
  memberDepartment: string | null;
  /** "onboarding" = reception intake + registration (+ read-only journey subtab);
   *  "workstation" = lab pipeline for already-paid requests (no registration). */
  mode?: "onboarding" | "workstation";
  /** Lite mode hides the onboarding Journey sub-tab (registration only). */
  lite?: boolean;
}) {
  const isOnboarding = mode === "onboarding";
  const [requests, setRequests] = useState<WReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WReq | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [revealing, setRevealing] = useState(false);

  // Onboarding-only: which sub-view, the walk-in modal, and its quick panels.
  const [obView, setObView] = useState<"register" | "journey">("register");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInTemplates, setWalkInTemplates] = useState<{ id: string; name: string; test_names: string[] }[]>([]);
  // Radiology booking calendar modal.
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [deptF, setDeptF] = useState(memberDepartment ?? "");
  // Workstation pipeline sub-filter: "" = all active, otherwise a workflow stage key.
  const [stageF, setStageF] = useState("");
  // Onboarding filters: registration status and payment.
  const [statusF, setStatusF] = useState("");
  const [paidF, setPaidF] = useState("");
  // List ordering by registration time (newest ↔ oldest).
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");
  // Time-window filter (applies to both onboarding and workstation lists).
  const [periodF, setPeriodF] = useState<PeriodKey>("all");
  // The lab's configured departments (falls back to the built-in defaults).
  const [departments, setDepartments] = useState<DepartmentConfig[]>(DEFAULT_DEPARTMENTS);

  useEffect(() => {
    fetch("/api/lab/departments", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.departments?.length) setDepartments(d.departments); })
      .catch(() => {});
  }, []);

  function openWalkIn() {
    fetch("/api/lab/templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWalkInTemplates((d?.templates ?? []).map((t: { id: string; name: string; test_names: string[] }) => ({ id: t.id, name: t.name, test_names: t.test_names }))))
      .catch(() => {});
    setWalkInOpen(true);
  }

  // Switching department resets the pipeline sub-filter.
  const selectDept = useCallback((d: string) => { setDeptF(d); setStageF(""); }, []);

  // New-QR-registration notifications (onboarding only): poll, then bubble up
  // any QR self-registrations that arrived since this device last acknowledged.
  const [lastSeenQr, setLastSeenQr] = useState<number>(() => Date.now());
  const [fabOpen, setFabOpen] = useState(false);
  useEffect(() => {
    if (!isOnboarding) return;
    try {
      const key = `poveon_onboard_lastseen_${labId}`;
      const stored = localStorage.getItem(key);
      if (stored) setLastSeenQr(Number(stored));
      else localStorage.setItem(key, String(Date.now()));
    } catch { /* ignore */ }
  }, [isOnboarding, labId]);

  // `silent` background refreshes update the list in place without blanking the
  // content behind a spinner (prevents the flicker on the 20s poll).
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/lab/journey", { cache: "no-store" });
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch {
      if (!silent) toast.error("Failed to load workspace");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Light polling so new QR registrations surface without a manual refresh.
  useEffect(() => {
    if (!isOnboarding) return;
    const id = setInterval(() => { if (!document.hidden) load(true); }, 20000);
    return () => clearInterval(id);
  }, [isOnboarding, load]);

  const newQr = useMemo(
    () => (isOnboarding ? requests.filter((r) => (r.source ?? "") === "qr" && new Date(r.created_at).getTime() > lastSeenQr) : []),
    [requests, isOnboarding, lastSeenQr]
  );
  function markQrSeen() {
    const now = Date.now();
    setLastSeenQr(now);
    setFabOpen(false);
    try { localStorage.setItem(`poveon_onboard_lastseen_${labId}`, String(now)); } catch { /* ignore */ }
  }

  const matchesQuery = useCallback((r: WReq) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return r.code.toLowerCase().includes(q) || (r.patient_name ?? "").toLowerCase().includes(q) || (r.patient_phone ?? "").includes(q);
  }, [query]);

  const periodFrom = useMemo(() => periodStart(periodF), [periodF]);

  // Department tracks parse each request's breakdown, so compute them once per
  // request (not on every keystroke / render) — keeps filtering snappy.
  const tracksByReq = useMemo(() => {
    const m = new Map<string, Track[]>();
    for (const r of requests) m.set(r.id, tracksFor(r, departments));
    return m;
  }, [requests, departments]);
  const getTracks = useCallback((r: WReq) => tracksByReq.get(r.id) ?? tracksFor(r, departments), [tracksByReq, departments]);

  const filtered = useMemo(() => requests.filter((r) => {
    if (!matchesQuery(r)) return false;
    if (periodFrom != null && new Date(r.created_at).getTime() < periodFrom) return false;

    if (isOnboarding) {
      if (obView === "register") {
        // Registration queue — not yet completed.
        if (r.status === "done") return false;
        // Once confirmed & paid the client is fully registered — they move on to
        // the Journey subtab and leave the Register queue.
        if (r.is_paid && r.tests_confirmed) return false;
        // Pre-arrival Poveon leads stay hidden until their code is entered via
        // the "Have a Poveon code?" box (which opens them directly).
        if (r.source === "poveon" && r.status === "incoming") return false;
        if (statusF === "incoming" && r.status !== "incoming") return false;
        if (statusF === "seen" && r.status !== "seen") return false;
        if (paidF === "paid" && !r.is_paid) return false;
        if (paidF === "unpaid" && r.is_paid) return false;
        return true;
      }
      // Journey subtab — registered (paid) patients still in the pipeline.
      return r.is_paid && r.status !== "done";
    }

    // Workstation: paid requests only (unpaid live in Onboarding).
    if (!r.is_paid) return false;
    const tracks = getTracks(r);
    if (deptF && !tracks.some((t) => t.department === deptF)) return false;
    if (stageF) {
      const t = tracks.find((x) => x.department === deptF);
      if (!t || t.currentStage !== stageF) return false;
    } else if (r.status === "done") {
      // Default view hides completed work — pick the "Reported" stage to see it.
      return false;
    }
    return true;
  }), [requests, getTracks, deptF, stageF, statusF, paidF, periodFrom, isOnboarding, obView, matchesQuery]);

  // Displayed list, ordered by registration time per the sort toggle.
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const d = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortDir === "newest" ? -d : d;
    });
    return arr;
  }, [filtered, sortDir]);

  const active = useMemo(() => requests.filter((r) => r.status !== "done"), [requests]);

  // Headline stats reflect the current tab and any applied filters (computed
  // over the filtered set so the numbers always match what's on screen).
  // Workstation stats are one card per non-terminal pipeline stage, each
  // labelled by the NEXT phase it's waiting for ("Awaiting investigation", …).
  const stats = useMemo(() => {
    if (isOnboarding && obView === "register") {
      return {
        register: true,
        unregistered: filtered.filter((r) => r.status === "incoming").length,
        awaitingPayment: filtered.filter((r) => r.status !== "incoming" && r.status !== "done" && !(r.is_paid && r.tests_confirmed)).length,
        stageCounts: [] as { stage: string; label: string; count: number }[],
      };
    }
    const scopeWorkflows = deptF
      ? [departments.find((d) => d.name === deptF)?.workflow ?? "specimen"]
      : Array.from(new Set(departments.map((d) => d.workflow)));
    const scopeStages = STAGE_ORDER.filter((st) => scopeWorkflows.some((w) => (WORKFLOWS[w] ?? WORKFLOWS.specimen).includes(st)));
    const counts = new Map<string, number>();
    for (const r of filtered) {
      for (const t of getTracks(r).filter((t) => !deptF || t.department === deptF)) {
        if (t.currentStage && t.currentStage !== "reported") counts.set(t.currentStage, (counts.get(t.currentStage) ?? 0) + 1);
      }
    }
    return {
      register: false,
      unregistered: 0,
      awaitingPayment: 0,
      stageCounts: scopeStages.map((st) => ({ stage: st, label: awaitingLabel(st), count: counts.get(st) ?? 0 })),
    };
  }, [filtered, getTracks, departments, deptF, isOnboarding, obView]);

  // Per-department active workload (for the quick department switcher).
  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of active) for (const t of getTracks(r)) m.set(t.department, (m.get(t.department) ?? 0) + 1);
    return m;
  }, [active, getTracks]);
  // Pipeline stages for the selected department's workflow (for the sub-filter).
  const subStages = deptF ? (WORKFLOWS[(departments.find((d) => d.name === deptF)?.workflow ?? "specimen")] ?? WORKFLOWS.specimen) : [];
  const selectedIsImaging = departments.find((d) => d.name === deptF)?.workflow === "imaging";

  // Auto-triage: number active (not-done) requests by arrival order — first in = #1.
  const triageNo = useMemo(() => {
    const m = new Map<string, number>();
    [...active]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [active]);

  async function markSeen(r: WReq) {
    setBusy(true);
    try {
      const res = await fetch("/api/requests/update-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id, status: "seen" }) });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "Failed");
      toast.success("Patient marked seen");
      await load();
      setSelected((s) => (s && s.id === r.id ? { ...s, status: "seen" } : s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function advance(r: WReq, track: Track, stage: string, sampleLabel?: string, note?: string, scheduledAt?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/journey/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id, department: track.department, stage, sample_label: sampleLabel, note, scheduled_at: scheduledAt }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`${track.department}: ${stageLabel(stage)}`);
      await load();
      setSelected((s) => (s ? requests.find((x) => x.id === s.id) ?? s : s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function registration(r: WReq, flags: { tests_confirmed?: boolean; is_paid?: boolean }) {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/requests/registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id, ...flags }) });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "Failed");
      toast.success(flags.is_paid ? "Marked as paid" : flags.tests_confirmed ? "Tests confirmed" : "Updated");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function revealByCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) { toast.error("Enter a Poveon request code"); return; }
    setRevealing(true);
    try {
      const res = await fetch("/api/requests/retrieve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Request not found");
      toast.success("Patient checked in");
      setCodeInput("");
      const list = await fetch("/api/lab/journey", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (list?.requests) {
        setRequests(list.requests);
        const fresh = (list.requests as WReq[]).find((r) => r.id === data.request?.id);
        if (fresh) setSelected(fresh);
      } else {
        await load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setRevealing(false);
    }
  }

  // keep the drawer's request in sync after reloads
  useEffect(() => {
    if (selected) { const fresh = requests.find((r) => r.id === selected.id); if (fresh && fresh !== selected) setSelected(fresh); }
  }, [requests]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      {/* Onboarding: Register / Journey sub-tabs (Journey is shown in Lite too) */}
      {isOnboarding && (
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          {([["register", "Register"], ["journey", "Journey"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setObView(v)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${obView === v ? "bg-medical-600 text-white" : "text-slate-300 hover:text-white"}`}>{label}</button>
          ))}
        </div>
      )}

      {/* Intake — onboarding "Register" view only (walk-in modal + Poveon check-in) */}
      {isOnboarding && obView === "register" && canAdvance && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-white"><UserPlus className="h-4 w-4 text-medical-300" /> Intake</p>
            <button data-tour="ob-walkin" onClick={openWalkIn} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700">
              <UserPlus className="h-3.5 w-3.5" /> Register walk-in
            </button>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-400">Have a Poveon code? Check the patient in</label>
            <div className="flex gap-2">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") revealByCode(); }}
                placeholder="e.g. 8X4K29Q (prefix optional)"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono uppercase tracking-wider text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-medical-400 focus:outline-none"
              />
              <button data-tour="ob-poveon-code" onClick={revealByCode} disabled={revealing || !codeInput.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                {revealing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Reveal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats — onboarding: registration tasks; workstation: one card per stage,
          each labelled by the next phase it's waiting for. Lite mode shows no
          statistics at all — just the client list. */}
      {!lite && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isOnboarding && obView === "register" ? (
          <>
            <StatCard label="To register" value={stats.unregistered ?? 0} accent="amber" icon={<UserPlus className="h-4 w-4" />} />
            <StatCard label="Tests & payment" value={stats.awaitingPayment ?? 0} accent="amber" icon={<CreditCard className="h-4 w-4" />} />
          </>
        ) : (
          <>
            {(() => {
              // Only surface stages that actually have work, so the cards reflect
              // the current department/stage filter instead of a wall of zeros.
              const nonZero = stats.stageCounts.filter((sc) => sc.count > 0);
              if (nonZero.length === 0) return <StatCard label="No active work" value={0} accent="slate" icon={<Check className="h-4 w-4" />} />;
              return nonZero.map((sc) => (
                <StatCard key={sc.stage} label={sc.label} value={sc.count} accent={stageAccent(sc.stage)} icon={<Workflow className="h-4 w-4" />} />
              ));
            })()}
            {selectedIsImaging && (
              <button onClick={() => setScheduleOpen(true)} className="flex items-center justify-between gap-2 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 text-left transition hover:bg-sky-500/15">
                <div>
                  <p className="text-xs font-medium text-sky-200/80">Bookings</p>
                  <p className="mt-1 text-sm font-semibold text-white">Open schedule</p>
                </div>
                <CalendarIcon className="h-5 w-5 text-sky-300" />
              </button>
            )}
          </>
        )}
      </div>
      )}

      {/* Onboarding "Register" filters: registration status + payment (not in Lite) */}
      {!lite && isOnboarding && obView === "register" && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Status"
            value={statusF}
            onChange={setStatusF}
            className="w-44"
            options={[{ value: "", label: "All" }, { value: "incoming", label: "Unregistered" }, { value: "seen", label: "Registered" }]}
          />
          <FilterSelect
            label="Payment"
            value={paidF}
            onChange={setPaidF}
            className="w-44"
            options={[{ value: "", label: "All" }, { value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" }]}
          />
        </div>
      )}

      {/* Workstation filters: department + pipeline stage (modern dropdowns) */}
      {!isOnboarding && (
        <div className="flex flex-wrap items-center gap-2">
          {!memberDepartment && (
            <FilterSelect
              label="Department"
              value={deptF}
              onChange={selectDept}
              className="w-56"
              options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.name, label: d.name, count: deptCounts.get(d.name) || undefined }))]}
            />
          )}
          {deptF && (
            <FilterSelect
              label="Stage"
              value={stageF}
              onChange={setStageF}
              className="w-48"
              options={[{ value: "", label: "All stages" }, ...subStages.map((s) => ({ value: s, label: stageLabel(s) }))]}
            />
          )}
        </div>
      )}

      {/* Search + period + sort — Lite keeps only the search box, no filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code, name or phone" className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none" />
        </div>
        {!lite && (
          <>
            <FilterSelect
              label="Period"
              value={periodF}
              onChange={(v) => setPeriodF(v as PeriodKey)}
              className="w-44"
              options={[
                { value: "all", label: "All time" },
                { value: "today", label: "Today" },
                { value: "week", label: "This week" },
                { value: "month", label: "This month" },
                { value: "year", label: "This year" },
              ]}
            />
            <FilterSelect
              label="Sort"
              value={sortDir}
              onChange={(v) => setSortDir(v as "newest" | "oldest")}
              className="w-40"
              options={[{ value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }]}
            />
          </>
        )}
      </div>

      {/* Radiology booking calendar */}
      {scheduleOpen && (
        <FullViewModal title="Radiology schedule" subtitle="Booked scans by day" maxWidth="max-w-4xl" onClose={() => setScheduleOpen(false)}>
          <ScheduleCalendar onSelectRequest={(id) => { const r = requests.find((x) => x.id === id); if (r) { setSelected(r); setScheduleOpen(false); } }} />
        </FullViewModal>
      )}

      {/* Walk-in registration modal (onboarding) */}
      {walkInOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setWalkInOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Register walk-in</h3>
              <button onClick={() => setWalkInOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <LabOnboardForm
              lab={{ id: labId, name: labName, slug: labSlug ?? undefined }}
              source="walk_in"
              templates={walkInTemplates}
              onSuccess={() => { setTimeout(() => { setWalkInOpen(false); load(); }, 1500); }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-16 text-center text-slate-400">No matching requests.</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => {
            const tracks = getTracks(r).filter((t) => !deptF || t.department === deptF);
            const pending = nextPendingAction(r, departments);
            return (
              <button key={r.id} onClick={() => setSelected(r)} className={`block w-full rounded-2xl border bg-white/5 p-4 text-left transition hover:bg-white/10 ${pending ? "border-medical-500/40" : "border-white/10"}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {triageNo.has(r.id) && (
                      <span className="mt-0.5 inline-flex h-6 shrink-0 items-center justify-center rounded-full bg-medical-600/25 px-2 text-xs font-bold text-medical-200" title="Triage position — first in, first served">
                        #{triageNo.get(r.id)}
                      </span>
                    )}
                    <div className="min-w-0">
                      {/* Lite mode makes the essentials — patient, tests, referrer — larger and easier to scan. */}
                      <p className={`truncate font-semibold text-white ${lite ? "text-base" : "text-sm"}`}>{r.patient_name || (r.status === "incoming" ? "Unregistered patient" : "Unnamed")} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                      <p className={`truncate ${lite ? "text-sm text-slate-200" : "text-xs text-slate-400"}`}>{r.tests}</p>
                      {r.diagnosis && <p className="mt-0.5 truncate text-[10px] text-amber-200/80">Dx: {r.diagnosis}</p>}
                      {(r.doctor_name || r.doctor_hospital) && (
                        <p className={`mt-0.5 truncate text-medical-300 ${lite ? "text-xs font-medium" : "text-[10px]"}`}>
                          Ref: {[[r.doctor_prefix, r.doctor_name].filter(Boolean).join(" "), r.doctor_hospital].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-slate-500" title={fmtDateTime(r.created_at)}>Registered {timeAgo(r.created_at)}</p>
                    </div>
                  </div>
                </div>
                {isOnboarding && obView === "register" ? (
                  // Register subtab: source + payment + registration status (these
                  // patients aren't in the pipeline yet, so no pipeline pills).
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SourceBadge source={r.source} />
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${r.is_paid ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                      <CreditCard className="h-3 w-3" /> {r.is_paid ? "Paid" : "Unpaid"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "seen" ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"}`}>{statusLabel(r.status)}</span>
                    {pending && <PendingBadge action={pending} />}
                  </div>
                ) : (
                  // Journey subtab + workstation: pipeline status + natural "waiting" line.
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tracks.map((t) => (
                        <span key={t.department} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${stageColorClasses(t.currentStage)}`}>
                          <span className="font-medium opacity-90">{t.department}</span>
                          <span className="opacity-60">·</span>
                          <span className="font-medium">{stageLabel(t.currentStage)}</span>
                        </span>
                      ))}
                      {pending && <PendingBadge action={pending} />}
                    </div>
                    {tracks.filter((t) => t.currentStage !== "reported").map((t) => {
                      const { currentMs } = stageDurations(t.events, r.created_at);
                      return (
                        <p key={t.department} className="text-[11px] text-slate-400">
                          <span className="font-medium text-slate-300">{formatDuration(currentMs)}</span> {awaitingPhrase(t.currentStage, t.workflow as "specimen" | "imaging" | "procedure")}
                          {tracks.length > 1 ? <span className="text-slate-500"> · {t.department}</span> : null}
                        </p>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <WorkspaceDrawer
          request={selected}
          labId={labId}
          departments={departments}
          mode={mode}
          lite={lite}
          readOnly={isOnboarding && obView === "journey"}
          onClose={() => setSelected(null)}
          canAdvance={canAdvance}
          canEnterResults={canEnterResults}
          canSendResults={canSendResults}
          memberDepartment={memberDepartment}
          busy={busy}
          onMarkSeen={() => markSeen(selected)}
          onAdvance={(track, stage, label, note, scheduledAt) => advance(selected, track, stage, label, note, scheduledAt)}
          onRegistration={(flags) => registration(selected, flags)}
          onChanged={load}
        />
      )}

      {/* New-QR-registration notification FAB (onboarding) */}
      {isOnboarding && newQr.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[9998] flex flex-col items-end">
          {fabOpen && (
            <div className="mb-3 max-h-80 w-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-800 p-2 shadow-2xl">
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-xs font-semibold text-slate-300">New QR registrations</p>
                <button onClick={markQrSeen} className="text-[11px] text-medical-300 hover:text-white">Mark all seen</button>
              </div>
              {newQr.map((r) => (
                <button key={r.id} onClick={() => { setSelected(r); setObView("register"); setFabOpen(false); }} className="block w-full rounded-lg px-2 py-2 text-left hover:bg-white/10">
                  <span className="block truncate text-sm text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></span>
                  <span className="block text-[10px] text-slate-400">Registered {timeAgo(r.created_at)}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setFabOpen((v) => !v)} className="relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-medical-600 text-white shadow-xl transition hover:bg-medical-700" title="New QR registrations">
            <Bell className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">{newQr.length}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function WorkspaceDrawer({
  request, labId, departments, mode, lite, readOnly, onClose, canAdvance, canEnterResults, canSendResults, memberDepartment, busy, onMarkSeen, onAdvance, onRegistration, onChanged,
}: {
  request: WReq;
  labId: string;
  departments: DepartmentConfig[];
  mode: "onboarding" | "workstation";
  /** Lite labs get a simplified drawer: no step-by-step checklist or tutorial. */
  lite?: boolean;
  readOnly: boolean;
  onClose: () => void;
  canAdvance: boolean;
  canEnterResults: boolean;
  canSendResults: boolean;
  memberDepartment: string | null;
  busy: boolean;
  onMarkSeen: () => void;
  onAdvance: (track: Track, stage: string, label?: string, note?: string, scheduledAt?: string) => Promise<void> | void;
  onRegistration: (flags: { tests_confirmed?: boolean; is_paid?: boolean }) => Promise<void> | void;
  onChanged: () => void;
}) {
  // Onboarding "Register" handles intake/payment; the pipeline (tracks/results)
  // belongs to the Workstation. Onboarding's "Journey" subtab shows the pipeline
  // read-only.
  const showRegistration = mode === "onboarding" && !readOnly;
  const showPipeline = mode === "workstation" || readOnly;
  const pipelineInteractive = mode === "workstation";
  const tracks = tracksFor(request, departments).filter((t) => !memberDepartment || t.department === memberDepartment);
  const [resultsFor, setResultsFor] = useState<{ department: string } | null>(null);
  const [collectFor, setCollectFor] = useState<Track | null>(null);
  const [milestone, setMilestone] = useState<{ track: Track; stage: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);
  const [results, setResults] = useState<RResult[]>([]);

  // Contextual tutorial: when the drawer opens with the Guide on, jump to the
  // client-detail steps; restore the list step when it closes.
  const { enabled: tourEnabled, running: tourRunning, goToKey } = useLabTour();
  useEffect(() => {
    if (tourEnabled && tourRunning) goToKey(showRegistration ? "ob-edit-details" : "ws-advance");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The single next action the lab must take to move this client forward.
  const pending = nextPendingAction(request, departments);
  const pendIs = (kind: PendingAction["kind"], dept?: string) =>
    !!pending && pending.kind === kind && (dept === undefined || pending.department === dept);
  const pulse = "animate-pending-pulse ring-1 ring-medical-400";

  // Results per department — surfaces sent vs still-pending in the pipeline.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lab/results?requestId=${request.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.results) setResults(d.results); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [request.id]);

  function resultStatusFor(department: string): { label: string; cls: string } | null {
    const rs = results.filter((x) => (x.department ?? "") === department || (!x.department && tracks.length === 1));
    if (rs.length === 0) return { label: "Result pending", cls: "bg-amber-500/15 text-amber-300" };
    if (rs.some((x) => x.status === "reported")) return { label: "Result sent", cls: "bg-emerald-500/15 text-emerald-300" };
    if (rs.some((x) => x.status === "verified")) return { label: "Verified — not sent", cls: "bg-violet-500/15 text-violet-300" };
    return { label: "Result drafted", cls: "bg-sky-500/15 text-sky-300" };
  }

  function nextStage(track: Track): string | null {
    const stages = WORKFLOWS[track.workflow as keyof typeof WORKFLOWS] ?? WORKFLOWS.specimen;
    const idx = stages.indexOf(track.currentStage);
    return idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;
  }

  // Where to physically direct the client once paid (Laboratory vs Radiology).
  const directions = directToDepartments(request.test_breakdown, departments);

  return (
    <FullViewModal
      title={request.patient_name || "Patient"}
      subtitle={`${request.code} · ${statusLabel(request.status)}`}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left column — client & request details */}
        <div>
            {/* Raw request as typed by the physician — always shown for reference,
                falling back to the submitted tests text when there is no
                free-form input (full-form requests). */}
            {(request.raw_input || request.tests) && (
              <div className="mt-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Request as written by the doctor</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">“{request.raw_input || request.tests}”</p>
              </div>
            )}
            {request.diagnosis && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2 py-1 text-xs text-amber-200">
                <span className="font-medium">Diagnosis:</span> {request.diagnosis}
              </p>
            )}

            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Detected tests</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {testPills(request).map((p, i) => (
                <span key={i} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${p.recognized ? "border border-medical-500/40 bg-medical-600/25 text-medical-100" : "border border-white/10 bg-white/5 text-slate-300"}`} title={p.recognized ? "Recognised in your catalog" : "Not in your catalog"}>
                  {p.recognized && <Check className="h-4 w-4" />}{p.name}
                </span>
              ))}
            </div>
            {costBreakdown(request).total > 0 && (
              <p className="mt-1.5 text-xs text-slate-300">Estimated total: <span className="font-semibold text-white">{fmtNaira(costBreakdown(request).total)}</span></p>
            )}
            <p className="mt-1.5 text-[11px] text-slate-500">
              Registered {fmtDateTime(request.created_at)}
              {request.seen_at ? ` · Seen ${fmtDateTime(request.seen_at)}` : ""}
              {request.completed_at ? ` · Done ${fmtDateTime(request.completed_at)}` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {[request.patient_phone, request.patient_email, request.sex, request.patient_age != null ? `${request.patient_age}y` : null].filter(Boolean).join(" · ") || "No contact details on file"}
            </p>
            {/* Full referring details — labs need to see exactly who sent the
                patient (name, hospital and how to reach the doctor). */}
            {(request.doctor_name || request.doctor_email || request.doctor_hospital) && (
              <div className="mt-3 rounded-xl border border-medical-500/30 bg-medical-600/15 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-medical-300">
                  <Stethoscope className="h-3.5 w-3.5" /> Referring doctor
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  {[request.doctor_prefix, request.doctor_name].filter(Boolean).join(" ") || "Name not provided"}
                </p>
                {request.doctor_hospital && (
                  <p className="mt-0.5 text-xs font-medium text-medical-200">{request.doctor_hospital}</p>
                )}
                {(request.doctor_phone || request.doctor_email) && (
                  <p className="mt-0.5 text-xs text-slate-300">
                    {[request.doctor_phone, request.doctor_email].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            )}
            {showRegistration && canAdvance && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button data-tour="ob-edit-details" onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-medical-300 hover:bg-white/5">
                  <Pencil className="h-3.5 w-3.5" /> Edit client details
                </button>
                {request.status !== "done" && (
                  <button data-tour="ob-edit-tests" onClick={() => setTestsOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-medical-300 hover:bg-white/5">
                    <FlaskConical className="h-3.5 w-3.5" /> Edit tests
                  </button>
                )}
              </div>
            )}
            {/* Print the visit checklist from the Journey / workstation views too
                (the onboarding "Register" checklist has its own print button). */}
            {!showRegistration && (
              <a href={`/api/lab/requests/${request.id}/checklist-pdf`} target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-medical-300 hover:bg-white/5">
                <Printer className="h-3.5 w-3.5" /> Print visit checklist
              </a>
            )}
        </div>

        {/* Right column — checklist (onboarding) / pipeline (workstation) */}
        <div className="space-y-4">

        {/* Lite mode skips the step-by-step checklist: just the cost summary and
            the two actions, so the important information stays front and centre. */}
        {lite && showRegistration && request.status !== "done" && canAdvance && !request.is_paid && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-white"><CreditCard className="h-4 w-4 text-medical-300" /> Tests &amp; payment</p>
            {(() => {
              const { rows, total } = costBreakdown(request);
              return rows.length > 0 ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                  <div className="space-y-1">
                    {rows.map((x, i) => (
                      <div key={i} className="flex justify-between gap-3 text-slate-300">
                        <span className="truncate">{x.name}</span>
                        <span className="shrink-0 tabular-nums">{x.price != null ? fmtNaira(x.price) : "—"}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-semibold text-white">
                    <span>Total to collect</span><span className="tabular-nums">{fmtNaira(total)}</span>
                  </div>
                </div>
              ) : null;
            })()}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onRegistration({ tests_confirmed: !request.tests_confirmed })} disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${request.tests_confirmed ? "border border-emerald-500/30 bg-emerald-600/20 text-emerald-300" : "bg-white/10 text-slate-200 hover:bg-white/15"}`}>
                {request.tests_confirmed ? <Check className="h-3.5 w-3.5" /> : <FlaskConical className="h-3.5 w-3.5" />} {request.tests_confirmed ? "Tests confirmed" : "Confirm tests"}
              </button>
              <button onClick={() => setTestsOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5">
                <Pencil className="h-3.5 w-3.5" /> Edit tests
              </button>
              <button onClick={() => onRegistration({ is_paid: true })} disabled={busy || !request.tests_confirmed}
                className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Mark as paid
              </button>
              <a href={`/api/lab/requests/${request.id}/checklist-pdf`} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-medical-300 hover:bg-white/5">
                <Printer className="h-3.5 w-3.5" /> Print visit checklist
              </a>
            </div>
            {!request.tests_confirmed && <p className="mt-2 text-[11px] text-slate-400">Confirm the tests to enable “Mark as paid”.</p>}
          </div>
        )}

        {/* Onboarding checklist — confirm tests, take payment, then direct the client */}
        {!lite && showRegistration && request.status !== "done" && canAdvance && !request.is_paid && (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><AlertTriangle className="h-4 w-4" /> Onboarding checklist</p>
            <p className="mt-1 text-xs text-amber-100/80">Work top to bottom — the next step to do is highlighted.</p>

            {/* Step list */}
            <ol className="mt-3 space-y-1.5 text-xs">
              <ChecklistItem done={!!request.patient_name} label="1. Confirm client details" />
              <ChecklistItem done={request.tests_confirmed} label="2. Edit & confirm the tests" />
              <ChecklistItem done={request.is_paid} label="3. Take payment & mark as paid" />
              <ChecklistItem done={false} label="4. Direct the client to the right department" />
            </ol>

            {(() => {
              const { rows, total } = costBreakdown(request);
              return rows.length > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
                  <div className="space-y-1">
                    {rows.map((x, i) => (
                      <div key={i} className="flex justify-between gap-3 text-amber-100/80">
                        <span className="truncate">{x.name}</span>
                        <span className="shrink-0 tabular-nums">{x.price != null ? fmtNaira(x.price) : "—"}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between border-t border-amber-500/20 pt-2 font-semibold text-amber-100">
                    <span>Total to collect</span><span className="tabular-nums">{fmtNaira(total)}</span>
                  </div>
                </div>
              ) : null;
            })()}
            <div className="mt-3 flex flex-wrap gap-2">
              <button data-tour="ob-confirm-tests" onClick={() => onRegistration({ tests_confirmed: !request.tests_confirmed })} disabled={busy}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${request.tests_confirmed ? "border border-emerald-500/30 bg-emerald-600/20 text-emerald-300" : `bg-white/10 text-slate-200 hover:bg-white/15 ${pendIs("confirm_tests") ? pulse : ""}`}`}>
                {request.tests_confirmed ? <Check className="h-3.5 w-3.5" /> : <FlaskConical className="h-3.5 w-3.5" />} {request.tests_confirmed ? "Tests confirmed" : "Confirm tests"}
              </button>
              <button data-tour="ob-edit-tests" onClick={() => setTestsOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5">
                <Pencil className="h-3.5 w-3.5" /> Edit tests
              </button>
              <button data-tour="ob-mark-paid" onClick={() => onRegistration({ is_paid: true })} disabled={busy || !request.tests_confirmed}
                className={`inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50 ${pendIs("mark_paid") ? pulse : ""}`}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Mark as paid
              </button>
            </div>
            {!request.tests_confirmed && <p className="mt-2 text-[11px] text-amber-100/60">Confirm the tests to enable “Mark as paid”.</p>}

            {/* Direct-to-department guidance */}
            <div data-tour="ob-direct" className="mt-3 border-t border-amber-500/20 pt-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200/80"><MapPin className="h-3.5 w-3.5" /> Direct the client to</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {directions.map((d) => (
                  <span key={d.department} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] ${stageColorClasses(d.workflow === "imaging" ? "scheduled" : "collected")}`}>
                    <span className="font-semibold">{d.department}</span><span className="opacity-70">· {d.hint}</span>
                  </span>
                ))}
              </div>
              {/* Final onboarding step — give the client a printed checklist to carry
                  between departments. Enabled once the front desk has confirmed the tests. */}
              <a
                href={request.tests_confirmed ? `/api/lab/requests/${request.id}/checklist-pdf` : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!request.tests_confirmed}
                onClick={(e) => { if (!request.tests_confirmed) e.preventDefault(); }}
                className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border border-medical-400/40 bg-medical-600/20 px-3 py-1.5 text-xs font-semibold text-medical-100 hover:bg-medical-600/30 ${request.tests_confirmed ? "" : "pointer-events-none opacity-50"}`}
              >
                <Printer className="h-3.5 w-3.5" /> Print visit checklist
              </a>
              {!request.tests_confirmed && <p className="mt-1 text-[11px] text-amber-100/60">Confirm the tests to print the client&apos;s checklist.</p>}
            </div>
          </div>
        )}
        {showRegistration && request.is_paid && request.status !== "done" && (
          <div className="rounded-xl bg-emerald-500/10 p-3 text-xs font-medium text-emerald-300">
            <p className="flex items-center gap-2"><Check className="h-4 w-4" /> {lite ? "Confirmed & paid." : "Confirmed & paid — moved to the workstation."}</p>
            {lite && (
              <a href={`/api/lab/requests/${request.id}/checklist-pdf`} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25">
                <Printer className="h-3.5 w-3.5" /> Print visit checklist
              </a>
            )}
            {!lite && (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 text-emerald-200/80"><MapPin className="h-3 w-3" /> Send to:</span>
                  {directions.map((d) => (
                    <span key={d.department} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-200">{d.department} · {d.hint}</span>
                  ))}
                </div>
                <a href={`/api/lab/requests/${request.id}/checklist-pdf`} target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25">
                  <Printer className="h-3.5 w-3.5" /> Print visit checklist
                </a>
              </>
            )}
          </div>
        )}

        {/* Department tracks (workstation pipeline; read-only in onboarding's Journey) */}
        {showPipeline && (
        <div className="space-y-4">
          {tracks.map((track) => {
            const stages = WORKFLOWS[track.workflow as keyof typeof WORKFLOWS] ?? WORKFLOWS.specimen;
            const curIdx = stages.indexOf(track.currentStage);
            const ns = nextStage(track);
            const durations = stageDurations(track.events, request.created_at);
            const segByStage = new Map(durations.segments.map((s) => [s.stage, s]));
            const resultStatus = resultStatusFor(track.department);
            return (
              <div key={track.department} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white"><Workflow className="h-4 w-4 text-medical-300" /> {track.department}</p>
                  <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center">
                    {resultStatus && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${resultStatus.cls}`}><FileText className="h-3 w-3" /> {resultStatus.label}</span>}
                    {track.currentStage !== "reported" && <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"><Clock className="h-3 w-3" /> {formatDuration(durations.currentMs)} {awaitingPhrase(track.currentStage, track.workflow as "specimen" | "imaging" | "procedure")}</span>}
                  </div>
                </div>
                {/* stepper */}
                <div className="flex items-center">
                  {stages.map((s, i) => (
                    <div key={s} className="flex flex-1 items-center last:flex-none">
                      <div className="flex flex-col items-center">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] ${i < curIdx ? "bg-emerald-500 border-emerald-500 text-white" : i === curIdx ? "bg-medical-500 border-medical-400 text-white" : "bg-white/5 border-white/15 text-slate-500"}`}>
                          {i < curIdx ? <Check className="h-3 w-3" /> : i + 1}
                        </div>
                        <span className={`mt-1 text-[9px] ${i <= curIdx ? "text-slate-200" : "text-slate-500"}`}>{stageLabel(s)}</span>
                        {i < curIdx && segByStage.has(s) && <span className="text-[8px] text-slate-500">{formatDuration(segByStage.get(s)!.ms)}</span>}
                      </div>
                      {i < stages.length - 1 && <div className={`mx-1 h-0.5 flex-1 ${i < curIdx ? "bg-emerald-500/60" : "bg-white/10"}`} />}
                    </div>
                  ))}
                </div>

                {/* collections (specimen only) */}
                {track.workflow === "specimen" && track.collections.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {track.collections.map((c) => (
                      <span key={c.id} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{c.sample_label || "Sample"} · {fmtDayTime(c.created_at)}</span>
                    ))}
                  </div>
                )}

                {/* milestone action notes */}
                {track.events.some((e) => e.note && e.stage !== "collected") && (
                  <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
                    {track.events.filter((e) => e.note && e.stage !== "collected").map((e) => (
                      <p key={e.id} className="text-[11px] text-slate-400">
                        <span className="text-slate-300">{stageLabel(e.stage)}:</span> {e.note}
                        <span className="text-slate-600"> · {fmtDayTime(e.created_at)}</span>
                      </p>
                    ))}
                  </div>
                )}

                {pipelineInteractive && canAdvance && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ns ? (
                      <button
                        data-tour="ws-advance"
                        onClick={() => { if (ns === "collected") setCollectFor(track); else setMilestone({ track, stage: ns }); }}
                        disabled={busy || !request.is_paid}
                        title={!request.is_paid ? "Confirm tests & mark as paid first" : undefined}
                        className={`inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50 ${(pendIs("advance", track.department) || pendIs("collect", track.department)) ? pulse : ""}`}
                      >
                        <ArrowRight className="h-3.5 w-3.5" /> {MILESTONE_ACTIONS[ns]?.cta ?? `Advance to ${stageLabel(ns)}`}
                      </button>
                    ) : <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">Track complete</span>}
                    {track.workflow === "specimen" && (
                      <button
                        onClick={() => setCollectFor(track)}
                        disabled={busy || !request.is_paid}
                        title={!request.is_paid ? "Confirm tests & mark as paid first" : undefined}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add collection
                      </button>
                    )}
                  </div>
                )}

                {pipelineInteractive && canEnterResults && (
                  <button data-tour="ws-results" onClick={() => setResultsFor({ department: track.department })} className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-medical-300 hover:bg-white/5 ${pendIs("enter_results") ? pulse : ""}`}>
                    <FlaskConical className="h-3.5 w-3.5" /> Enter / send results
                  </button>
                )}
              </div>
            );
          })}
        </div>
        )}
        </div>
      </div>

        {resultsFor && (
          <ResultEntry
            request={request}
            department={resultsFor.department}
            canSendResults={canSendResults}
            onClose={() => setResultsFor(null)}
            onChanged={onChanged}
          />
        )}

        {collectFor && (
          <CollectionPicker
            labId={labId}
            track={collectFor}
            busy={busy}
            onClose={() => setCollectFor(null)}
            onConfirm={async (labels) => {
              for (const label of labels) {
                await onAdvance(collectFor, "collected", label);
              }
              setCollectFor(null);
            }}
          />
        )}

        {milestone && (
          <MilestoneModal
            track={milestone.track}
            stage={milestone.stage}
            busy={busy}
            onClose={() => setMilestone(null)}
            onConfirm={async (note, scheduledAt) => {
              await onAdvance(milestone.track, milestone.stage, undefined, note, scheduledAt);
              setMilestone(null);
            }}
          />
        )}

        {editOpen && (
          <PatientEditForm
            request={request}
            onClose={() => setEditOpen(false)}
            onSaved={() => { setEditOpen(false); onChanged(); }}
          />
        )}

        {testsOpen && (
          <TestsEditForm
            request={request}
            labId={labId}
            onClose={() => setTestsOpen(false)}
            onSaved={() => { setTestsOpen(false); onChanged(); }}
          />
        )}
    </FullViewModal>
  );
}

/** A single onboarding-checklist line with done/pending state. */
function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 ${done ? "text-emerald-300" : "text-amber-100/80"}`}>
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${done ? "border-emerald-400 bg-emerald-500/20" : "border-amber-300/40"}`}>
        {done && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </li>
  );
}

/** Add or remove the tests to be done on a registered request (walk-in/Poveon/QR). */
function TestsEditForm({
  request, labId, onClose, onSaved,
}: {
  request: WReq;
  labId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Seed from the resolved breakdown so catalog-recognised tests show as recognised
  // (green pills with their catalog id) instead of collapsing to plain free text.
  const [tests, setTests] = useState<TestTag[]>(() => {
    const bd = Array.isArray(request.test_breakdown)
      ? (request.test_breakdown as { raw?: string; canonical_name?: string; category?: string; unit_price?: number; source?: string; lab_offered_test_id?: string | null }[])
      : [];
    if (bd.length > 0) {
      return bd
        .map((it): TestTag => {
          const recognized = it.source === "lab_catalog";
          return {
            name: it.canonical_name || it.raw || "",
            catalog_test_id: recognized ? (it.lab_offered_test_id ?? null) : null,
            price: it.unit_price,
            category: it.category,
            low_confidence: !recognized,
          };
        })
        .filter((t) => t.name);
    }
    return (request.tests || "").split(",").map((s) => s.trim()).filter(Boolean).map((n) => ({ name: n, catalog_test_id: null }));
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (tests.length === 0) { toast.error("Add at least one test"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/lab/requests/update-tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, tests: tests.map((t) => t.name).join(", ") }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "Failed");
      toast.success("Tests updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Edit tests</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-2 text-xs text-slate-400">Add or remove the investigations to be done. Department tracks update automatically.</p>
        <TestTagInput value={tests} onChange={setTests} labId={labId} />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving || tests.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save tests
          </button>
        </div>
      </div>
    </div>
  );
}

/** Short action sheet that captures the detail for a single journey milestone.
 *  For the "scheduled" milestone it shows a real calendar to book the appointment. */
function MilestoneModal({
  track, stage, busy, onClose, onConfirm,
}: {
  track: Track;
  stage: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note?: string, scheduledAt?: string) => void;
}) {
  const cfg = MILESTONE_ACTIONS[stage] ?? { cta: `Advance to ${stageLabel(stage)}`, title: `Advance to ${stageLabel(stage)}`, field: "Note (optional)", placeholder: "", prompt: "" };
  const isScheduling = stage === "scheduled";
  // "Performed" picks which scan/procedure was done from the request's tests.
  const isPerformed = stage === "performed" && track.tests.length > 0;
  const [note, setNote] = useState("");
  const [when, setWhen] = useState<Date | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  const togglePick = (t: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });

  function confirm() {
    if (isScheduling) {
      if (!when) return;
      const label = when.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      onConfirm(label, when.toISOString());
    } else if (isPerformed) {
      if (picked.size === 0) return;
      onConfirm(`${Array.from(picked).join(", ")} done`);
    } else {
      onConfirm(note.trim() || undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{cfg.title}</h3>
            <p className="text-xs text-slate-400">{track.department} · {stageLabel(stage)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {cfg.prompt && <p className="mb-3 text-sm text-slate-300">{cfg.prompt}</p>}

        {isScheduling ? (
          <>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">Pick a date &amp; time *</label>
            <Calendar value={when} onSelect={setWhen} withTime />
            {when && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-medical-600/15 px-2.5 py-1 text-xs text-medical-200"><CalendarIcon className="h-3.5 w-3.5" /> {when.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
          </>
        ) : isPerformed ? (
          <>
            <label className="mb-2 block text-xs font-medium text-slate-400">Which scan / procedure was done? *</label>
            <div className="flex flex-wrap gap-2">
              {track.tests.map((t) => {
                const on = picked.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => togglePick(t)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${on ? "border-medical-400 bg-medical-600/25 text-white" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"}`}
                  >
                    {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} {t}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs font-medium text-slate-400">{cfg.field}{cfg.required ? " *" : ""}</label>
            <input
              autoFocus
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (!cfg.required || note.trim())) confirm(); }}
              placeholder={cfg.placeholder}
            />
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">Cancel</button>
          <button
            onClick={confirm}
            disabled={busy || (isScheduling ? !when : isPerformed ? picked.size === 0 : cfg.required && !note.trim())}
            className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {cfg.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Register / correct a client's details (name, age, sex, phone, email). */
function PatientEditForm({
  request, onClose, onSaved,
}: {
  request: WReq;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(request.patient_name ?? "");
  const [age, setAge] = useState(request.patient_age != null ? String(request.patient_age) : "");
  const [sex, setSex] = useState((request.sex ?? "").toLowerCase());
  const [phone, setPhone] = useState(request.patient_phone ?? "");
  const [email, setEmail] = useState(request.patient_email ?? "");
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/lab/requests/update-patient", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          patient_name: name.trim(),
          age: age.trim() === "" ? "" : Number(age),
          sex: sex || "",
          patient_phone: phone.trim(),
          patient_email: email.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "Failed");
      toast.success("Client details updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Client details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          {(request.doctor_name || request.doctor_email) && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Referring doctor</label>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                <Stethoscope className="h-4 w-4 shrink-0 text-medical-300" />
                <span className="truncate">{request.doctor_name || request.doctor_email}</span>
                <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-500" />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">From the Poveon referral — locked, can&rsquo;t be changed here.</p>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Full name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Age</label>
              <input className={inputCls} value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="e.g. 34" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Sex</label>
              <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="" className="bg-slate-800">—</option>
                <option value="male" className="bg-slate-800">Male</option>
                <option value="female" className="bg-slate-800">Female</option>
                <option value="other" className="bg-slate-800">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Phone</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email (optional)" />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Picker for logging specimen collections. Lets the operator tick the tests the
 * patient is actually doing in this department, and add extra samples by name
 * (typeahead against the lab's own catalog). Each chosen label is logged as a
 * separate "collected" journey event.
 */
function CollectionPicker({
  labId, track, busy, onClose, onConfirm,
}: {
  labId: string;
  track: Track;
  busy: boolean;
  onClose: () => void;
  onConfirm: (labels: string[]) => void;
}) {
  const already = new Set(track.collections.map((c) => (c.sample_label || "").toLowerCase()));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [results, setResults] = useState<{ id: string; raw_name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const toggle = (label: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });

  // Typeahead against the lab's own catalog for "extra" samples.
  useEffect(() => {
    const q = extra.trim();
    if (q.length < 1) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalog/search?lab_id=${encodeURIComponent(labId)}&q=${encodeURIComponent(q)}&limit=8`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setResults(data.results ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [extra, labId]);

  const addExtra = (label: string) => {
    const v = label.trim();
    if (!v) return;
    setSelected((prev) => new Set(prev).add(v));
    setExtra("");
    setResults([]);
  };

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Add collection</h3>
            <p className="text-xs text-slate-400">{track.department}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Tests the patient is doing in this department */}
        {track.tests.length > 0 ? (
          <>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Tests requested</p>
            <div className="mb-4 flex flex-wrap gap-2">
              {track.tests.map((t) => {
                const collected = already.has(t.toLowerCase());
                const on = selected.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggle(t)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      on ? "border-medical-400 bg-medical-600/25 text-white" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} {t}
                    {collected && <span className="text-[9px] text-emerald-300">· collected</span>}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="mb-4 text-xs text-slate-500">No catalog-matched tests on this request — add samples below.</p>
        )}

        {/* Extra samples from the catalog or free text */}
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Add extra sample</p>
        <div className="relative">
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(extra); } }}
            placeholder="Search catalog or type a label (e.g. FBS, 2HPP)"
            className={inputCls}
          />
          {(searching || results.length > 0) && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-slate-800 shadow-2xl">
              {searching && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
              {results.map((r) => (
                <button key={r.id} onClick={() => addExtra(r.raw_name)} className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10">
                  {r.raw_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected summary */}
        {selected.size > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {Array.from(selected).map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-medical-600/20 px-2 py-0.5 text-[11px] text-medical-200">
                {s}
                <button onClick={() => toggle(s)} className="text-medical-300 hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">Cancel</button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={busy || selected.size === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Log {selected.size > 0 ? `${selected.size} ` : ""}collection{selected.size === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultEntry({
  request, department, canSendResults, onClose, onChanged,
}: {
  request: WReq;
  department: string;
  canSendResults: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<ResultTemplate[]>([]);
  const [existing, setExisting] = useState<RResult | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [rows, setRows] = useState<{ name: string; value: string; unit: string; reference_range: string; group: string }[]>([]);
  const [comment, setComment] = useState("");
  const [resultId, setResultId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("new");
  const [busy, setBusy] = useState(false);
  // Result templates hidden for now — new results are delivered as a document or link.
  // The "editor" branch is retained only to display previously-entered template results.
  const [mode, setMode] = useState<"editor" | "document" | "link">("document");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [sendOnAttach, setSendOnAttach] = useState(true);

  async function attach(kind: "document" | "link") {
    if (kind === "document" && !docFile) { toast.error("Choose a file"); return; }
    if (kind === "link" && !linkUrl.trim()) { toast.error("Enter a link"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("request_id", request.id);
      if (department) fd.append("department", department);
      fd.append("kind", kind);
      fd.append("send", String(sendOnAttach && canSendResults));
      if (kind === "document" && docFile) fd.append("file", docFile);
      if (kind === "link") fd.append("url", linkUrl.trim());
      const res = await fetch("/api/lab/results/attach", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.sent ? "Result sent to patient" : "Result attached");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  useEffect(() => {
    (async () => {
      const [tRes, rRes] = await Promise.all([
        fetch("/api/lab/result-templates", { cache: "no-store" }),
        fetch(`/api/lab/results?requestId=${request.id}`, { cache: "no-store" }),
      ]);
      if (tRes.ok) { const d = await tRes.json(); setTemplates((d.templates ?? []).filter((t: ResultTemplate) => !t.department || t.department === department || !DEFAULT_DEPARTMENTS.some((dd) => dd.name === department))); }
      if (rRes.ok) {
        const d = await rRes.json();
        const found = (d.results ?? []).find((x: RResult) => (x.department ?? "") === department) ?? null;
        if (found) {
          setExisting(found); setResultId(found.id); setStatus(found.status); setComment(found.comment ?? "");
          setRows((found.values ?? []).map((v: RResult["values"][number]) => ({ name: v.name, value: v.value ?? "", unit: v.unit ?? "", reference_range: v.reference_range ?? "", group: v.group ?? "" })));
        }
      }
    })();
  }, [request.id, department]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setRows(t.parameters.map((p) => ({ name: p.name, value: "", unit: p.unit ?? "", reference_range: p.reference_range ?? "", group: p.group ?? "" })));
  }

  async function saveDraft(): Promise<string | null> {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: resultId ?? undefined, request_id: request.id, template_id: templateId || undefined, department, values: rows, comment }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResultId(data.result.id); setStatus(data.result.status);
      toast.success("Saved");
      return data.result.id as string;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed"); return null;
    } finally { setBusy(false); }
  }

  async function verify() {
    const id = resultId ?? (await saveDraft());
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lab/results/${id}/verify`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setStatus("verified"); toast.success("Verified");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  async function report(send: boolean) {
    const id = resultId; if (!id) { toast.error("Save & verify first"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/lab/results/${id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ send }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(send ? "Report sent to patient" : "Report generated");
      setStatus("reported");
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{department} result</h3>
            <p className="font-mono text-xs text-slate-400">{request.code} · {status}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Result delivery mode */}
        {!existing && (
          <div className="mb-4 inline-flex w-full rounded-xl border border-white/10 bg-white/5 p-1">
            {([["document", "Attach document"], ["link", "Send a link"]] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${mode === m ? "bg-medical-600 text-white" : "text-slate-300 hover:text-white"}`}>{label}</button>
            ))}
          </div>
        )}

        {(existing || mode === "editor") && (
          <>
            {!existing && (
              <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className="mb-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none">
                <option value="" className="bg-slate-800">Pick a result template…</option>
                {templates.map((t) => <option key={t.id} value={t.id} className="bg-slate-800">{t.name}</option>)}
              </select>
            )}

            {rows.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/5 py-6 text-center text-sm text-slate-400">Pick a template to load its parameters.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <span className="col-span-5">Parameter</span><span className="col-span-3">Result</span><span className="col-span-4">Reference</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-5 truncate text-sm text-slate-200">{row.name}{row.unit ? <span className="text-slate-500"> ({row.unit})</span> : null}</span>
                    <input className={`${inputCls} col-span-3`} value={row.value} disabled={status === "reported"} onChange={(e) => setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))} />
                    <span className="col-span-4 truncate text-xs text-slate-400">{row.reference_range || "—"}</span>
                  </div>
                ))}
                <textarea className={`${inputCls} mt-2`} rows={2} placeholder="Comment (optional)" value={comment} disabled={status === "reported"} onChange={(e) => setComment(e.target.value)} />
              </div>
            )}

            {rows.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {status !== "reported" && <button onClick={saveDraft} disabled={busy} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50">Save draft</button>}
                {status !== "reported" && <button onClick={verify} disabled={busy} className="rounded-xl bg-medical-600 px-3 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}</button>}
                {resultId && (status === "verified" || status === "reported") && (
                  <>
                    <a href={`/api/lab/results/${resultId}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"><Printer className="h-4 w-4" /> Print</a>
                    {canSendResults && <button onClick={() => report(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Send className="h-4 w-4" /> Send to patient</button>}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {!existing && mode === "document" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5 py-8 text-center hover:bg-white/10">
              <Printer className="mb-2 h-6 w-6 text-medical-300" />
              <span className="text-sm text-slate-200">{docFile ? docFile.name : "Click to choose a result document"}</span>
              <span className="mt-1 text-xs text-slate-500">PDF, image or scan · max 15MB</span>
              <input type="file" accept=".pdf,image/*,.doc,.docx" className="hidden" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
            </label>
            {canSendResults && (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={sendOnAttach} onChange={(e) => setSendOnAttach(e.target.checked)} /> Email it to the patient/doctor now
              </label>
            )}
            <button onClick={() => attach("document")} disabled={busy || !docFile} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {sendOnAttach && canSendResults ? "Attach & send" : "Attach result"}
            </button>
          </div>
        )}

        {!existing && mode === "link" && (
          <div className="space-y-3">
            <input className={`${inputCls} px-3 py-2`} placeholder="https://… (link to the result)" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            {canSendResults && (
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={sendOnAttach} onChange={(e) => setSendOnAttach(e.target.checked)} /> Email it to the patient/doctor now
              </label>
            )}
            <button onClick={() => attach("link")} disabled={busy || !linkUrl.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {sendOnAttach && canSendResults ? "Save & send link" : "Save link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
