"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Search, X, ArrowRight, Plus, Workflow, QrCode, UserPlus, Printer, Send, Check, FlaskConical } from "lucide-react";
import toast from "react-hot-toast";
import { SourceBadge, SOURCE_OPTIONS } from "@/components/lab/SourceBadge";
import { OnboardingPanel } from "@/components/lab/OnboardingPanel";
import { requestDepartments, WORKFLOWS, workflowForDepartment, stageLabel, DEPARTMENTS } from "@/lib/lims-shared";

interface JEvent { id: string; stage: string; department: string | null; sample_label: string | null; note: string | null; actor_email: string | null; created_at: string }
interface WReq {
  id: string; code: string; status: string; source: string; current_stage: string | null;
  patient_name: string | null; patient_phone: string | null; tests: string;
  created_at: string; seen_at: string | null; completed_at: string | null;
  test_breakdown: unknown; journey_events: JEvent[];
}
interface Track { department: string; workflow: string; currentStage: string; events: JEvent[]; collections: JEvent[] }
interface ResultTemplate { id: string; name: string; department: string | null; parameters: { name: string; unit?: string; reference_range?: string; group?: string }[] }
interface RResult { id: string; request_id: string; department: string | null; status: string; values: { name: string; value?: string; unit?: string; reference_range?: string; group?: string; flag?: string }[]; comment: string | null; pdf_url: string | null }

function tracksFor(r: WReq): Track[] {
  const depts = requestDepartments(r.test_breakdown);
  return depts.map(({ department, workflow }) => {
    const events = r.journey_events.filter((e) => e.department === department);
    const last = events[events.length - 1];
    return {
      department,
      workflow,
      currentStage: last?.stage ?? "registered",
      events,
      collections: events.filter((e) => e.stage === "collected"),
    };
  });
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "incoming", label: "Incoming" },
  { value: "seen", label: "Seen" },
  { value: "done", label: "Done" },
];

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
    if (statusF && r.status !== statusF) return false;
    if (sourceF && (r.source ?? "poveon") !== sourceF) return false;
    if (deptF && !tracksFor(r).some((t) => t.department === deptF)) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.code.toLowerCase().includes(q) && !(r.patient_name ?? "").toLowerCase().includes(q) && !(r.patient_phone ?? "").includes(q)) return false;
    }
    return true;
  }), [requests, statusF, sourceF, deptF, query]);

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

  async function advance(r: WReq, track: Track, stage: string, sampleLabel?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/journey/advance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: r.id, department: track.department, stage, sample_label: sampleLabel }) });
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
          onClose={() => setSelected(null)}
          canAdvance={canAdvance}
          canEnterResults={canEnterResults}
          canSendResults={canSendResults}
          memberDepartment={memberDepartment}
          busy={busy}
          onMarkSeen={() => markSeen(selected)}
          onAdvance={(track, stage, label) => advance(selected, track, stage, label)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function WorkspaceDrawer({
  request, onClose, canAdvance, canEnterResults, canSendResults, memberDepartment, busy, onMarkSeen, onAdvance, onChanged,
}: {
  request: WReq;
  onClose: () => void;
  canAdvance: boolean;
  canEnterResults: boolean;
  canSendResults: boolean;
  memberDepartment: string | null;
  busy: boolean;
  onMarkSeen: () => void;
  onAdvance: (track: Track, stage: string, label?: string) => void;
  onChanged: () => void;
}) {
  const tracks = tracksFor(request).filter((t) => !memberDepartment || t.department === memberDepartment);
  const [resultsFor, setResultsFor] = useState<{ department: string } | null>(null);

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

                {canAdvance && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ns ? (
                      <button onClick={() => onAdvance(track, ns)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                        <ArrowRight className="h-3.5 w-3.5" /> Advance to {stageLabel(ns)}
                      </button>
                    ) : <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">Track complete</span>}
                    {track.workflow === "specimen" && (
                      <button
                        onClick={() => { const label = window.prompt("Sample label (e.g. FBS, 2HPP)"); if (label) onAdvance(track, "collected", label); }}
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
      </div>
    </div>
  );
}
