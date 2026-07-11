"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Loader2, Search, Plus, Trash2, Eye, Send, Save, Check, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { requestDepartments } from "@/lib/lims-shared";
import type { ResultTemplateLite } from "@/components/lab/ResultEntry";

interface Row { name: string; value: string; unit: string; reference_range: string; group: string }
interface Selected { key: string; templateId: string; name: string; department: string; rows: Row[]; comment: string; resultId: string | null; status: string; dirty: boolean }
interface ExistingResult { id: string; department: string | null; status: string; template_id: string | null; values: Row[]; comment: string | null; kind: string }

interface ComposerReq {
  id: string; code: string;
  patient_name: string | null; patient_phone: string | null; patient_age: number | null; sex: string | null;
  tests: string; test_breakdown: unknown;
}

let seq = 0;
const key = () => `s${seq++}`;

/** Tokens (≥3 chars) from a blob of text, for fuzzy template↔test matching. */
function tokens(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 3));
}

export function ResultComposer({ request, canSendResults, onClose, onSaved }: {
  request: ComposerReq;
  canSendResults: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templates, setTemplates] = useState<ResultTemplateLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"select" | "input">("select");
  const [selected, setSelected] = useState<Selected[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const derivedDepts = useMemo(() => requestDepartments(request.test_breakdown).map((d) => d.department), [request.test_breakdown]);
  const deptForTemplate = useCallback((tpl: ResultTemplateLite) => {
    if (tpl.department === "Radiology") return "Radiology";
    return derivedDepts.find((d) => d !== "Radiology") ?? derivedDepts[0] ?? "Laboratory";
  }, [derivedDepts]);

  const rowsFrom = (tpl: ResultTemplateLite): Row[] => tpl.parameters.map((p) => ({ name: p.name, value: "", unit: p.unit ?? "", reference_range: p.reference_range ?? "", group: p.group ?? "" }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, rRes] = await Promise.all([
        fetch("/api/lab/result-templates", { cache: "no-store" }),
        fetch(`/api/lab/results?requestId=${request.id}`, { cache: "no-store" }),
      ]);
      const tData = tRes.ok ? await tRes.json() : { templates: [] };
      const tpls: ResultTemplateLite[] = tData.templates ?? [];
      setTemplates(tpls);
      // Preselect any results already entered from a template.
      const rData = rRes.ok ? await rRes.json() : { results: [] };
      const existing: ExistingResult[] = rData.results ?? [];
      const pre: Selected[] = existing
        .filter((r) => r.kind !== "document" && r.kind !== "link" && r.template_id)
        .map((r) => {
          const tpl = tpls.find((t) => t.id === r.template_id);
          return {
            key: key(), templateId: r.template_id as string, name: tpl?.name ?? (r.department ?? "Result"),
            department: r.department ?? (tpl ? deptForTemplate(tpl) : "Laboratory"),
            rows: (r.values ?? []).map((v) => ({ name: v.name, value: v.value ?? "", unit: v.unit ?? "", reference_range: v.reference_range ?? "", group: v.group ?? "" })),
            comment: r.comment ?? "", resultId: r.id, status: r.status, dirty: false,
          };
        });
      setSelected(pre);
    } finally {
      setLoading(false);
    }
  }, [request.id, deptForTemplate]);
  useEffect(() => { load(); }, [load]);

  const selectedIds = new Set(selected.map((s) => s.templateId));

  // Suggested templates based on the tests ordered.
  const suggestions = useMemo(() => {
    const testTokens = tokens(`${request.tests} ${Array.isArray(request.test_breakdown) ? (request.test_breakdown as { canonical_name?: string; raw?: string }[]).map((b) => `${b.canonical_name ?? ""} ${b.raw ?? ""}`).join(" ") : ""}`);
    return templates.filter((t) => {
      if (selectedIds.has(t.id)) return false;
      return Array.from(tokens(t.name)).some((tk) => testTokens.has(tk));
    });
  }, [templates, request.tests, request.test_breakdown, selected]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates
      .filter((t) => !selectedIds.has(t.id) && (!q || t.name.toLowerCase().includes(q) || (t.department ?? "").toLowerCase().includes(q)))
      .slice(0, 40);
  }, [templates, query, selected]);

  function addTemplate(tpl: ResultTemplateLite) {
    setSelected((prev) => prev.some((s) => s.templateId === tpl.id) ? prev : [...prev, { key: key(), templateId: tpl.id, name: tpl.name, department: deptForTemplate(tpl), rows: rowsFrom(tpl), comment: "", resultId: null, status: "new", dirty: true }]);
  }
  function removeSelected(k: string) { setSelected((prev) => prev.filter((s) => s.key !== k)); }
  function setRow(k: string, i: number, value: string) {
    setSelected((prev) => prev.map((s) => s.key === k ? { ...s, dirty: true, rows: s.rows.map((r, idx) => idx === i ? { ...r, value } : r) } : s));
  }
  function setComment(k: string, comment: string) {
    setSelected((prev) => prev.map((s) => s.key === k ? { ...s, comment, dirty: true } : s));
  }

  /** Persist every selected template as a RequestResult; returns their ids in order. */
  async function saveAll(): Promise<string[] | null> {
    const ids: string[] = [];
    for (const s of selected) {
      if (s.resultId && !s.dirty) { ids.push(s.resultId); continue; }
      const res = await fetch("/api/lab/results", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.resultId ?? undefined, request_id: request.id, template_id: s.templateId, department: s.department, values: s.rows, comment: s.comment }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || `Failed to save ${s.name}`); return null; }
      ids.push(data.result.id);
      setSelected((prev) => prev.map((x) => x.key === s.key ? { ...x, resultId: data.result.id, status: data.result.status, dirty: false } : x));
    }
    return ids;
  }

  async function saveDrafts() {
    setBusy(true);
    try { const ids = await saveAll(); if (ids) { toast.success("Drafts saved"); onSaved(); } }
    finally { setBusy(false); }
  }

  async function preview() {
    setBusy(true);
    try {
      const ids = await saveAll();
      if (ids && ids.length) window.open(`/api/lab/results/preview?ids=${ids.join(",")}`, "_blank");
    } finally { setBusy(false); }
  }

  async function sendAll(send: boolean) {
    setBusy(true);
    try {
      const ids = await saveAll();
      if (!ids || ids.length === 0) return;
      const res = await fetch("/api/lab/results/send-combined", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, send }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(send ? "Results sent to patient" : "Results reported");
      onSaved(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  const cellCls = "w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white"><FileText className="h-5 w-5 text-medical-300" /> Results — {request.patient_name || "Patient"}</h2>
          <p className="font-mono text-xs text-slate-500">{request.code}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2 text-xs sm:px-6">
        <span className={`rounded-full px-2.5 py-1 font-medium ${step === "select" ? "bg-medical-600 text-white" : "bg-white/5 text-slate-400"}`}>1 · Choose templates</span>
        <ArrowRight className="h-3.5 w-3.5 text-slate-600" />
        <span className={`rounded-full px-2.5 py-1 font-medium ${step === "input" ? "bg-medical-600 text-white" : "bg-white/5 text-slate-400"}`}>2 · Enter & send</span>
        <span className="ml-auto text-slate-500">{selected.length} selected</span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-5">
            {step === "select" ? (
              <>
                {suggestions.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Suggested from tests ordered</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((t) => (
                        <button key={t.id} onClick={() => addTemplate(t)} className="inline-flex items-center gap-1.5 rounded-full border border-medical-400/40 bg-medical-500/10 px-3 py-1.5 text-xs font-medium text-medical-100 hover:bg-medical-500/20">
                          <Plus className="h-3.5 w-3.5" /> {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Search all templates</p>
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <Search className="h-4 w-4 shrink-0 text-slate-500" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or department…" className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" />
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-1">
                    {searchResults.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-slate-400">{templates.length === 0 ? "No templates yet — seed or create some in Result Templates." : "No matching templates."}</p>
                    ) : searchResults.map((t) => (
                      <button key={t.id} onClick={() => addTemplate(t)} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5">
                        <span className="truncate">{t.name}</span>
                        <span className="flex items-center gap-2">
                          {t.department && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">{t.department}</span>}
                          <Plus className="h-4 w-4 text-slate-500" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {selected.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Selected ({selected.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.map((s) => (
                        <span key={s.key} className="inline-flex items-center gap-1.5 rounded-full bg-medical-600 px-3 py-1.5 text-xs font-medium text-white">
                          {s.name}
                          <button onClick={() => removeSelected(s.key)} className="text-white/70 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {selected.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/5 py-10 text-center text-sm text-slate-400">No templates selected. Go back and choose some.</p>
                ) : selected.map((s) => (
                  <div key={s.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{s.name}</p>
                        <p className="text-[11px] text-slate-500">{s.department}{s.status !== "new" ? ` · ${s.status}` : ""}</p>
                      </div>
                      <button onClick={() => removeSelected(s.key)} className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <span className="col-span-5">Parameter</span><span className="col-span-3">Result</span><span className="col-span-4">Reference</span>
                      </div>
                      {s.rows.map((row, i) => (
                        <div key={i} className="grid grid-cols-12 items-center gap-2">
                          <span className="col-span-5 truncate text-sm text-slate-200">{row.name}{row.unit ? <span className="text-slate-500"> ({row.unit})</span> : null}</span>
                          <input className={`${cellCls} col-span-3`} value={row.value} disabled={s.status === "reported"} onChange={(e) => setRow(s.key, i, e.target.value)} />
                          <span className="col-span-4 truncate text-xs text-slate-400">{row.reference_range || "—"}</span>
                        </div>
                      ))}
                      <textarea className={`${cellCls} mt-1`} rows={2} placeholder="Comment (optional)" value={s.comment} disabled={s.status === "reported"} onChange={(e) => setComment(s.key, e.target.value)} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Sticky action bar */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-slate-900/80 px-4 py-3 sm:px-6">
        {step === "select" ? (
          <>
            <span className="text-xs text-slate-400">{selected.length} template{selected.length === 1 ? "" : "s"} selected</span>
            <button onClick={() => setStep("input")} disabled={selected.length === 0} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              Enter results <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setStep("select")} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5"><ArrowLeft className="h-4 w-4" /> Templates</button>
            <button onClick={saveDrafts} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"><Save className="h-4 w-4" /> Save drafts</button>
            <button onClick={preview} disabled={busy || selected.length === 0} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"><Eye className="h-4 w-4" /> Preview PDF</button>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => sendAll(false)} disabled={busy || selected.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-3 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"><Check className="h-4 w-4" /> Verify & report</button>
              {canSendResults && <button onClick={() => sendAll(true)} disabled={busy || selected.length === 0} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to patient</button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
