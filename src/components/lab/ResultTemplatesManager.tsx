"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, FileText, X } from "lucide-react";
import toast from "react-hot-toast";
import { DEPARTMENTS } from "@/lib/lims-shared";

interface Param { name: string; unit?: string; reference_range?: string; group?: string }
interface ResultTemplate {
  id: string;
  name: string;
  department: string | null;
  parameters: Param[];
  interpretation: string | null;
}

const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

export function ResultTemplatesManager({ canManage }: { canManage: boolean }) {
  const [templates, setTemplates] = useState<ResultTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ResultTemplate | null>(null);

  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [params, setParams] = useState<Param[]>([{ name: "", unit: "", reference_range: "", group: "" }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/result-templates", { cache: "no-store" });
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      toast.error("Failed to load result templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null); setName(""); setDepartment(""); setInterpretation("");
    setParams([{ name: "", unit: "", reference_range: "", group: "" }]); setShowForm(true);
  }
  function openEdit(t: ResultTemplate) {
    setEditing(t); setName(t.name); setDepartment(t.department ?? ""); setInterpretation(t.interpretation ?? "");
    setParams(t.parameters.length ? t.parameters.map((p) => ({ name: p.name, unit: p.unit ?? "", reference_range: p.reference_range ?? "", group: p.group ?? "" })) : [{ name: "", unit: "", reference_range: "", group: "" }]);
    setShowForm(true);
  }

  function setParam(i: number, patch: Partial<Param>) {
    setParams((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function save() {
    const cleaned = params.filter((p) => p.name.trim());
    if (!name.trim() || cleaned.length === 0) { toast.error("Add a name and at least one parameter"); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), department: department || undefined, interpretation: interpretation || undefined, parameters: cleaned };
      const res = editing
        ? await fetch(`/api/lab/result-templates/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/lab/result-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(editing ? "Template updated" : "Template created");
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: ResultTemplate) {
    if (!confirm(`Delete result template "${t.name}"?`)) return;
    try {
      const res = await fetch(`/api/lab/result-templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Template deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><FileText className="h-4 w-4 text-medical-300" /> Result report templates</p>
        {canManage && <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700"><Plus className="h-3.5 w-3.5" /> New template</button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : templates.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-sm text-slate-400">No result templates yet. Define a report (e.g. FBC) with parameters & reference ranges.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{t.name}</p>
                  {t.department && <p className="text-xs text-slate-400">{t.department}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openEdit(t)} className="rounded px-2 py-1 text-xs text-medical-300 hover:bg-white/5">Edit</button>
                    <button onClick={() => remove(t)} className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-300">{t.parameters.length} parameter{t.parameters.length === 1 ? "" : "s"}</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{editing ? "Edit result template" : "New result template"}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Template name (e.g. Full Blood Count)" value={name} onChange={(e) => setName(e.target.value)} />
              <select className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="" className="bg-slate-800">No department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d} className="bg-slate-800">{d}</option>)}
              </select>

              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-400">Parameters</p>
                <div className="space-y-2">
                  {params.map((p, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <input className={`${inputCls} col-span-4`} placeholder="Parameter" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} />
                      <input className={`${inputCls} col-span-2`} placeholder="Unit" value={p.unit} onChange={(e) => setParam(i, { unit: e.target.value })} />
                      <input className={`${inputCls} col-span-3`} placeholder="Ref range" value={p.reference_range} onChange={(e) => setParam(i, { reference_range: e.target.value })} />
                      <input className={`${inputCls} col-span-2`} placeholder="Group" value={p.group} onChange={(e) => setParam(i, { group: e.target.value })} />
                      <button onClick={() => setParams((prev) => prev.filter((_, idx) => idx !== i))} className="col-span-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setParams((prev) => [...prev, { name: "", unit: "", reference_range: "", group: "" }])} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"><Plus className="h-3.5 w-3.5" /> Add parameter</button>
              </div>

              <textarea className={inputCls} rows={2} placeholder="Default interpretation / comment (optional)" value={interpretation} onChange={(e) => setInterpretation(e.target.value)} />
              <button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Update template" : "Create template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
