"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Printer, Send, Search, Eye, Check } from "lucide-react";
import toast from "react-hot-toast";

export interface ResultTemplateLite { id: string; name: string; department: string | null; parameters: { name: string; unit?: string; reference_range?: string; group?: string }[] }
interface RResult { id: string; request_id: string; department: string | null; status: string; values: { name: string; value?: string; unit?: string; reference_range?: string; group?: string; flag?: string }[]; comment: string | null; pdf_url: string | null }
interface Row { name: string; value: string; unit: string; reference_range: string; group: string }

/**
 * Enter, verify, preview and send a single department's result for a request.
 * Shared by the Workstation drawer and the dedicated Results page.
 *
 * The template picker searches across ALL templates (department-matching ones
 * are surfaced first) rather than being locked to the open department.
 */
export function ResultEntry({
  request, department, canSendResults, onClose, onChanged,
}: {
  request: { id: string; code: string };
  department: string;
  canSendResults: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<ResultTemplateLite[]>([]);
  const [existing, setExisting] = useState<RResult | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [comment, setComment] = useState("");
  const [resultId, setResultId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("new");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"editor" | "document" | "link">("editor");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [sendOnAttach, setSendOnAttach] = useState(true);

  // Searchable template picker.
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

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
      if (tRes.ok) { const d = await tRes.json(); setTemplates(d.templates ?? []); }
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

  // Close the picker dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Department-matching templates first, then the rest; filtered by the query.
  const filteredTemplates = templates
    .filter((t) => !query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase()) || (t.department ?? "").toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => {
      const am = a.department === department ? 0 : 1;
      const bm = b.department === department ? 0 : 1;
      return am - bm || a.name.localeCompare(b.name);
    });

  function applyTemplate(t: ResultTemplateLite) {
    setTemplateId(t.id);
    setTemplateName(t.name);
    setRows(t.parameters.map((p) => ({ name: p.name, value: "", unit: p.unit ?? "", reference_range: p.reference_range ?? "", group: p.group ?? "" })));
    setPickerOpen(false);
    setQuery("");
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

  async function preview() {
    const win = window.open("", "_blank");
    const id = resultId ?? (await saveDraft());
    if (id) { if (win) win.location.href = `/api/lab/results/${id}/pdf`; else window.open(`/api/lab/results/${id}/pdf`, "_blank"); }
    else if (win) { win.close(); }
  }

  async function verify() {
    const id = resultId ?? (await saveDraft());
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lab/results/${id}/verify`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setStatus("verified"); toast.success("Verified"); onChanged();
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
          <div className="mb-4 inline-flex w-full rounded-xl border border-white/10 bg-white/5 p-1">
            {([["editor", "Use template"], ["document", "Attach document"], ["link", "Send a link"]] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${mode === m ? "bg-medical-600 text-white" : "text-slate-300 hover:text-white"}`}>{label}</button>
            ))}
          </div>
        )}

        {(existing || mode === "editor") && (
          <>
            {!existing && (
              <div ref={pickerRef} className="relative mb-3">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-slate-500" />
                  <input
                    value={pickerOpen ? query : (templateName || query)}
                    onChange={(e) => { setQuery(e.target.value); setPickerOpen(true); }}
                    onFocus={() => setPickerOpen(true)}
                    placeholder={templateName ? templateName : "Search result templates…"}
                    className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
                {pickerOpen && (
                  <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-white/10 bg-slate-800 shadow-xl">
                    {filteredTemplates.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-slate-400">{templates.length === 0 ? "No templates yet — create one in Result Templates." : "No match."}</p>
                    ) : filteredTemplates.map((t) => (
                      <button key={t.id} onClick={() => applyTemplate(t)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5">
                        <span className="truncate">{t.name}</span>
                        {t.department && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${t.department === department ? "bg-medical-500/20 text-medical-200" : "bg-white/10 text-slate-400"}`}>{t.department}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {rows.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/5 py-6 text-center text-sm text-slate-400">Search and pick a template to load its parameters.</p>
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
                <button onClick={preview} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-50"><Eye className="h-4 w-4" /> Preview PDF</button>
                {status !== "reported" && status !== "verified" && <button onClick={verify} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-3 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Verify</button>}
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
