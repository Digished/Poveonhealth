"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Search, X, ArrowRight, Plus, Workflow, QrCode, UserPlus, Printer, Send, Check, FlaskConical, Pencil, Stethoscope } from "lucide-react";
import toast from "react-hot-toast";
import { SourceBadge, SOURCE_OPTIONS } from "@/components/lab/SourceBadge";
import { OnboardingPanel } from "@/components/lab/OnboardingPanel";
import { StatCard } from "@/components/lab/StatCard";
import { requestDepartments, categoryToDepartment, WORKFLOWS, workflowForDepartment, stageLabel, DEPARTMENTS } from "@/lib/lims-shared";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

interface JEvent { id: string; stage: string; department: string | null; sample_label: string | null; note: string | null; actor_email: string | null; created_at: string }
interface WReq {
  id: string; code: string; status: string; source: string; current_stage: string | null;
  patient_name: string | null; patient_phone: string | null; patient_email: string | null;
  patient_age: number | null; sex: string | null;
  doctor_name: string | null; doctor_email: string | null; tests: string;
  created_at: string; seen_at: string | null; completed_at: string | null;
  test_breakdown: unknown; journey_events: JEvent[];
}
interface Track { department: string; workflow: string; currentStage: string; events: JEvent[]; collections: JEvent[]; tests: string[] }
interface ResultTemplate { id: string; name: string; department: string | null; parameters: { name: string; unit?: string; reference_range?: string; group?: string }[] }
interface RResult { id: string; request_id: string; department: string | null; status: string; values: { name: string; value?: string; unit?: string; reference_range?: string; group?: string; flag?: string }[]; comment: string | null; pdf_url: string | null }

function tracksFor(r: WReq): Track[] {
  const depts = requestDepartments(r.test_breakdown);
  const items = Array.isArray(r.test_breakdown)
    ? (r.test_breakdown as { category?: string | null; raw?: string; canonical_name?: string }[])
    : [];
  return depts.map(({ department, workflow }) => {
    const events = r.journey_events.filter((e) => e.department === department);
    const last = events[events.length - 1];
    const tests = items
      .filter((it) => categoryToDepartment(it.category).department === department)
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

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "incoming", label: "Incoming" },
  { value: "seen", label: "Seen" },
  { value: "done", label: "Done" },
];

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

export function Workspace({
  labId,
  labName,
  labSlug,
  canAdvance,
  canEnterResults,
  canSendResults,
  memberDepartment,
}: {
  labId: string;
  labName: string;
  labSlug: string | null;
  canAdvance: boolean;
  canEnterResults: boolean;
  canSendResults: boolean;
  memberDepartment: string | null;
}) {
  const [requests, setRequests] = useState<WReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WReq | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [revealing, setRevealing] = useState(false);

  const [query, setQuery] = useState("");
  const [statusF, setStatusF] = useState("");
  const [deptF, setDeptF] = useState(memberDepartment ?? "");
  const [sourceF, setSourceF] = useState("");
  const [hideCompleted, setHideCompleted] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/journey", { cache: "no-store" });
      const data = await res.json();
      setRequests(data.requests ?? []);
    } catch {
      toast.error("Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => requests.filter((r) => {
    // Hide completed (done) requests by default, unless explicitly filtering for them.
    if (hideCompleted && statusF !== "done" && r.status === "done") return false;
    if (statusF && r.status !== statusF) return false;
    if (sourceF && (r.source ?? "poveon") !== sourceF) return false;
    if (deptF && !tracksFor(r).some((t) => t.department === deptF)) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.code.toLowerCase().includes(q) && !(r.patient_name ?? "").toLowerCase().includes(q) && !(r.patient_phone ?? "").includes(q)) return false;
    }
    return true;
  }), [requests, statusF, sourceF, deptF, query, hideCompleted]);
  const completedCount = useMemo(() => requests.filter((r) => r.status === "done").length, [requests]);

  // Actionable insights across active (not-done) work.
  const active = useMemo(() => requests.filter((r) => r.status !== "done"), [requests]);
  const stats = useMemo(() => {
    let incoming = 0, awaitingCollection = 0, inAnalysis = 0, imagingPending = 0, readyToReport = 0;
    for (const r of active) {
      if (r.status === "incoming") incoming++;
      for (const t of tracksFor(r)) {
        if (t.workflow === "specimen" && t.currentStage === "registered") awaitingCollection++;
        if (t.currentStage === "in_analysis") inAnalysis++;
        if (t.currentStage === "verified") readyToReport++;
        if (t.workflow === "imaging" && t.currentStage !== "reported" && t.currentStage !== "registered") imagingPending++;
      }
    }
    return { incoming, awaitingCollection, inAnalysis, imagingPending, readyToReport, activeCount: active.length };
  }, [active]);

  // Per-department active workload (for the quick department switcher).
  const deptCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of active) for (const t of tracksFor(r)) m.set(t.department, (m.get(t.department) ?? 0) + 1);
    return m;
  }, [active]);
  const activeDepartments = DEPARTMENTS.filter((d) => (deptCounts.get(d) ?? 0) > 0);

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

  async function advance(r: WReq, track: Track, stage: string, sampleLabel?: string, note?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/journey/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id, department: track.department, stage, sample_label: sampleLabel, note }) });
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
      {/* Intake */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><UserPlus className="h-4 w-4 text-medical-300" /> Intake</p>
          <button onClick={() => setIntakeOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700">
            <QrCode className="h-3.5 w-3.5" /> {intakeOpen ? "Hide" : "Register / QR"}
          </button>
        </div>

        {/* Check in a patient who booked via Poveon */}
        {canAdvance && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-400">Have a Poveon code? Check the patient in</label>
            <div className="flex gap-2">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") revealByCode(); }}
                placeholder="e.g. LABA-8X4K29Q"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono uppercase tracking-wider text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-medical-400 focus:outline-none"
              />
              <button onClick={revealByCode} disabled={revealing || !codeInput.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                {revealing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Reveal
              </button>
            </div>
          </div>
        )}

        {intakeOpen && <div className="mt-4"><OnboardingPanel labId={labId} labName={labName} slug={labSlug} /></div>}
      </div>

      {/* Actionable insights */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Active" value={stats.activeCount} accent="medical" icon={<Workflow className="h-4 w-4" />} />
        <button onClick={() => { setStatusF("incoming"); setHideCompleted(true); }} className="text-left">
          <StatCard label="Incoming" value={stats.incoming} accent="amber" icon={<UserPlus className="h-4 w-4" />} />
        </button>
        <StatCard label="Awaiting collection" value={stats.awaitingCollection} accent="amber" icon={<FlaskConical className="h-4 w-4" />} />
        <StatCard label="In analysis" value={stats.inAnalysis} accent="violet" icon={<Workflow className="h-4 w-4" />} />
        <StatCard label="Ready to report" value={stats.readyToReport} accent="emerald" icon={<Send className="h-4 w-4" />} />
        <StatCard label="Imaging pending" value={stats.imagingPending} accent="violet" icon={<Printer className="h-4 w-4" />} />
      </div>

      {/* Quick department switcher */}
      {!memberDepartment && activeDepartments.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar">
          <button
            onClick={() => setDeptF("")}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${deptF === "" ? "border-medical-400 bg-medical-600/25 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            All departments
          </button>
          {activeDepartments.map((d) => (
            <button
              key={d}
              onClick={() => setDeptF(d)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${deptF === d ? "border-medical-400 bg-medical-600/25 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              {d}
              <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-slate-300">{deptCounts.get(d)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code, name or phone" className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none" />
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>)}
        </select>
        <select value={deptF} onChange={(e) => setDeptF(e.target.value)} disabled={!!memberDepartment} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none disabled:opacity-60">
          <option value="" className="bg-slate-800">All departments</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d} className="bg-slate-800">{d}</option>)}
        </select>
        <select value={sourceF} onChange={(e) => setSourceF(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none">
          {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>)}
        </select>
        <button
          onClick={() => setHideCompleted((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${hideCompleted ? "border-medical-500/40 bg-medical-600/20 text-medical-200" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
          title="Hide requests whose results are already delivered"
        >
          {hideCompleted ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} Hide completed{completedCount > 0 ? ` (${completedCount})` : ""}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-16 text-center text-slate-400">No matching requests.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const tracks = tracksFor(r).filter((t) => !deptF || t.department === deptF);
            return (
              <button key={r.id} onClick={() => setSelected(r)} className="block w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{r.patient_name || (r.status === "incoming" ? "Incoming patient" : "Unnamed")} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                    <p className="truncate text-xs text-slate-400">{r.tests}</p>
                    {r.doctor_name && <p className="mt-0.5 truncate text-[10px] text-medical-300">Ref: {r.doctor_name}</p>}
                    <p className="mt-0.5 text-[10px] text-slate-500">Registered {fmtDateTime(r.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <SourceBadge source={r.source} />
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "done" ? "bg-emerald-500/15 text-emerald-300" : r.status === "seen" ? "bg-sky-500/15 text-sky-300" : "bg-amber-500/15 text-amber-300"}`}>{r.status}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tracks.map((t) => (
                    <span key={t.department} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                      <span className="font-medium text-slate-200">{t.department}</span>
                      <span className="text-medical-300">{stageLabel(t.currentStage)}</span>
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <WorkspaceDrawer
          request={selected}
          labId={labId}
          onClose={() => setSelected(null)}
          canAdvance={canAdvance}
          canEnterResults={canEnterResults}
          canSendResults={canSendResults}
          memberDepartment={memberDepartment}
          busy={busy}
          onMarkSeen={() => markSeen(selected)}
          onAdvance={(track, stage, label, note) => advance(selected, track, stage, label, note)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function WorkspaceDrawer({
  request, labId, onClose, canAdvance, canEnterResults, canSendResults, memberDepartment, busy, onMarkSeen, onAdvance, onChanged,
}: {
  request: WReq;
  labId: string;
  onClose: () => void;
  canAdvance: boolean;
  canEnterResults: boolean;
  canSendResults: boolean;
  memberDepartment: string | null;
  busy: boolean;
  onMarkSeen: () => void;
  onAdvance: (track: Track, stage: string, label?: string, note?: string) => Promise<void> | void;
  onChanged: () => void;
}) {
  const tracks = tracksFor(request).filter((t) => !memberDepartment || t.department === memberDepartment);
  const [resultsFor, setResultsFor] = useState<{ department: string } | null>(null);
  const [collectFor, setCollectFor] = useState<Track | null>(null);
  const [milestone, setMilestone] = useState<{ track: Track; stage: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  function nextStage(track: Track): string | null {
    const stages = WORKFLOWS[track.workflow as keyof typeof WORKFLOWS] ?? WORKFLOWS.specimen;
    const idx = stages.indexOf(track.currentStage);
    return idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : null;
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{request.patient_name || "Patient"}</h3>
            <p className="font-mono text-xs text-slate-400">{request.code} · {request.status}</p>
            <p className="mt-1 text-xs text-slate-400">{request.tests}</p>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Registered {fmtDateTime(request.created_at)}
              {request.seen_at ? ` · Seen ${fmtDateTime(request.seen_at)}` : ""}
              {request.completed_at ? ` · Done ${fmtDateTime(request.completed_at)}` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {[request.patient_phone, request.patient_email, request.sex, request.patient_age != null ? `${request.patient_age}y` : null].filter(Boolean).join(" · ") || "No contact details on file"}
            </p>
            {(request.doctor_name || request.doctor_email) && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-medical-600/15 px-2 py-1 text-xs text-medical-200">
                <Stethoscope className="h-3.5 w-3.5" /> Referred by {request.doctor_name || request.doctor_email}
              </p>
            )}
            {canAdvance && (
              <button onClick={() => setEditOpen(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-medical-300 hover:bg-white/5">
                <Pencil className="h-3.5 w-3.5" /> Edit client details
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {request.status === "incoming" && canAdvance && (
          <button onClick={onMarkSeen} disabled={busy} className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mark patient seen
          </button>
        )}

        {/* Department tracks */}
        <div className="space-y-4">
          {tracks.map((track) => {
            const stages = WORKFLOWS[track.workflow as keyof typeof WORKFLOWS] ?? WORKFLOWS.specimen;
            const curIdx = stages.indexOf(track.currentStage);
            const ns = nextStage(track);
            return (
              <div key={track.department} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white"><Workflow className="h-4 w-4 text-medical-300" /> {track.department}</p>
                  <span className="text-xs text-slate-400">{track.workflow}</span>
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
                      </div>
                      {i < stages.length - 1 && <div className={`mx-1 h-0.5 flex-1 ${i < curIdx ? "bg-emerald-500/60" : "bg-white/10"}`} />}
                    </div>
                  ))}
                </div>

                {/* collections (specimen only) */}
                {track.workflow === "specimen" && track.collections.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {track.collections.map((c) => (
                      <span key={c.id} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300">{c.sample_label || "Sample"} · {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    ))}
                  </div>
                )}

                {/* milestone action notes */}
                {track.events.some((e) => e.note && e.stage !== "collected") && (
                  <div className="mt-3 space-y-1 border-t border-white/5 pt-3">
                    {track.events.filter((e) => e.note && e.stage !== "collected").map((e) => (
                      <p key={e.id} className="text-[11px] text-slate-400">
                        <span className="text-slate-300">{stageLabel(e.stage)}:</span> {e.note}
                        <span className="text-slate-600"> · {new Date(e.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      </p>
                    ))}
                  </div>
                )}

                {canAdvance && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ns ? (
                      <button
                        onClick={() => { if (ns === "collected") setCollectFor(track); else setMilestone({ track, stage: ns }); }}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
                      >
                        <ArrowRight className="h-3.5 w-3.5" /> {MILESTONE_ACTIONS[ns]?.cta ?? `Advance to ${stageLabel(ns)}`}
                      </button>
                    ) : <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">Track complete</span>}
                    {track.workflow === "specimen" && (
                      <button
                        onClick={() => setCollectFor(track)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add collection
                      </button>
                    )}
                  </div>
                )}

                {canEnterResults && (
                  <button onClick={() => setResultsFor({ department: track.department })} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-medical-300 hover:bg-white/5">
                    <FlaskConical className="h-3.5 w-3.5" /> Enter / send results
                  </button>
                )}
              </div>
            );
          })}
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
            onConfirm={async (note) => {
              await onAdvance(milestone.track, milestone.stage, undefined, note);
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
      </div>
    </div>
  );
}

/** Short action sheet that captures the detail for a single journey milestone. */
function MilestoneModal({
  track, stage, busy, onClose, onConfirm,
}: {
  track: Track;
  stage: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note?: string) => void;
}) {
  const cfg = MILESTONE_ACTIONS[stage] ?? { cta: `Advance to ${stageLabel(stage)}`, title: `Advance to ${stageLabel(stage)}`, field: "Note (optional)", placeholder: "", prompt: "" };
  const [note, setNote] = useState("");
  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{cfg.title}</h3>
            <p className="text-xs text-slate-400">{track.department} · {stageLabel(stage)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {cfg.prompt && <p className="mb-3 text-sm text-slate-300">{cfg.prompt}</p>}
        <label className="mb-1 block text-xs font-medium text-slate-400">{cfg.field}{cfg.required ? " *" : ""}</label>
        <input
          autoFocus
          className={inputCls}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (!cfg.required || note.trim())) onConfirm(note.trim() || undefined); }}
          placeholder={cfg.placeholder}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">Cancel</button>
          <button
            onClick={() => onConfirm(note.trim() || undefined)}
            disabled={busy || (cfg.required && !note.trim())}
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
  const [mode, setMode] = useState<"editor" | "document" | "link">("editor");
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
      if (tRes.ok) { const d = await tRes.json(); setTemplates((d.templates ?? []).filter((t: ResultTemplate) => !t.department || t.department === department || !DEPARTMENTS.includes(department as (typeof DEPARTMENTS)[number]))); }
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
            {([["editor", "A4 editor"], ["document", "Attach document"], ["link", "Send a link"]] as const).map(([m, label]) => (
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
