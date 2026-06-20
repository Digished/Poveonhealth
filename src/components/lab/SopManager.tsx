"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, ClipboardList, X, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { DEPARTMENTS } from "@/lib/lims-shared";

interface Sop {
  id: string;
  title: string;
  category: string | null;
  department: string | null;
  content: string;
  version: number;
  updated_at: string;
}

const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

const CATEGORY_SUGGESTIONS = ["Pre-analytical", "Analytical", "Post-analytical", "Safety", "Quality Control", "Equipment", "Specimen handling", "Biosafety", "General"];

export function SopManager({ canManage }: { canManage: boolean }) {
  const [sops, setSops] = useState<Sop[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Sop | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Sop | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/sops", { cache: "no-store" });
      const data = await res.json();
      setSops(data.sops ?? []);
    } catch {
      toast.error("Failed to load SOPs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null); setTitle(""); setCategory(""); setDepartment(""); setContent(""); setShowForm(true);
  }
  function openEdit(s: Sop) {
    setEditing(s); setTitle(s.title); setCategory(s.category ?? ""); setDepartment(s.department ?? ""); setContent(s.content ?? ""); setShowForm(true);
  }

  async function save() {
    if (!title.trim()) { toast.error("Add a title"); return; }
    setSaving(true);
    try {
      const payload = { title: title.trim(), category: category || "", department: department || "", content };
      const res = editing
        ? await fetch(`/api/lab/sops/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/lab/sops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(editing ? "SOP updated" : "SOP created");
      setShowForm(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Sop) {
    if (!confirm(`Delete SOP "${s.title}"?`)) return;
    try {
      const res = await fetch(`/api/lab/sops/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("SOP deleted");
      setViewing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  // Group by category for display.
  const groups = sops.reduce<Record<string, Sop[]>>((acc, s) => {
    const k = s.category || "Uncategorised";
    (acc[k] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><ClipboardList className="h-5 w-5 text-medical-300" /> Standard Operating Procedures</h2>
          <p className="mt-1 text-sm text-slate-400">Document and share your lab&apos;s procedures with the whole team.</p>
        </div>
        {canManage && <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700"><Plus className="h-3.5 w-3.5" /> New SOP</button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : sops.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 py-12 text-center text-sm text-slate-400">No SOPs yet. Document procedures like specimen collection, QC runs, or biosafety.</p>
      ) : (
        <div className="space-y-5">
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{cat}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((s) => (
                  <div key={s.id} className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10">
                    <button onClick={() => setViewing(s)} className="block w-full text-left">
                      <p className="truncate text-sm font-semibold text-white">{s.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {s.department ? `${s.department} · ` : ""}v{s.version} · updated {new Date(s.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                      <p className="mt-2 line-clamp-2 text-xs text-slate-300">{s.content || "No content yet."}</p>
                    </button>
                    {canManage && (
                      <div className="mt-3 flex items-center gap-1">
                        <button onClick={() => openEdit(s)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-medical-300 hover:bg-white/5"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                        <button onClick={() => remove(s)} className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View drawer */}
      {viewing && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setViewing(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{viewing.title}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {[viewing.category, viewing.department].filter(Boolean).join(" · ")}{(viewing.category || viewing.department) ? " · " : ""}v{viewing.version}
                </p>
              </div>
              <button onClick={() => setViewing(null)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-slate-200">{viewing.content || "No content yet."}</div>
            {canManage && (
              <div className="mt-4 flex gap-2">
                <button onClick={() => { const s = viewing; setViewing(null); openEdit(s); }} className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-3 py-2 text-sm font-semibold text-white hover:bg-medical-700"><Pencil className="h-4 w-4" /> Edit</button>
                <button onClick={() => remove(viewing)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 hover:text-red-300"><Trash2 className="h-4 w-4" /> Delete</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / edit form */}
      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setShowForm(false)}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{editing ? "Edit SOP" : "New SOP"}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Title (e.g. Venous blood collection)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <input className={inputCls} placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} list="sop-categories" />
                  <datalist id="sop-categories">{CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <select className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="" className="bg-slate-800">All departments</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d} className="bg-slate-800">{d}</option>)}
                </select>
              </div>
              <textarea className={inputCls} rows={12} placeholder="Procedure steps, purpose, scope, responsibilities…" value={content} onChange={(e) => setContent(e.target.value)} />
              <button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Update SOP" : "Create SOP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
