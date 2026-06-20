"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, Layers, X } from "lucide-react";
import toast from "react-hot-toast";
import { TestTagInput, TestTag } from "@/components/ui/TestTagInput";

interface Template {
  id: string;
  name: string;
  description: string | null;
  category_label: string | null;
  test_names: string[];
  tat_hours: number | null;
}

export function TemplatesManager({ labId, canManage }: { labId: string; canManage: boolean }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tatHours, setTatHours] = useState("");
  const [tests, setTests] = useState<TestTag[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/templates", { cache: "no-store" });
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null); setName(""); setDescription(""); setCategory(""); setTatHours(""); setTests([]); setShowForm(true);
  }
  function openEdit(t: Template) {
    setEditing(t); setName(t.name); setDescription(t.description ?? ""); setCategory(t.category_label ?? "");
    setTatHours(t.tat_hours != null ? String(t.tat_hours) : "");
    setTests(t.test_names.map((n) => ({ name: n, catalog_test_id: null })));
    setShowForm(true);
  }

  async function save() {
    if (!name.trim() || tests.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        category_label: category.trim() || undefined,
        tat_hours: tatHours ? Number(tatHours) : null,
        test_names: tests.map((t) => t.name),
      };
      const res = editing
        ? await fetch(`/api/lab/templates/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/lab/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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

  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      const res = await fetch(`/api/lab/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Template deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><Layers className="h-4 w-4 text-medical-300" /> Test templates / panels</p>
        {canManage && <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700"><Plus className="h-3.5 w-3.5" /> New panel</button>}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : templates.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-sm text-slate-400">No panels yet. Group common tests into a one-tap panel.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{t.name}</p>
                  {t.category_label && <p className="text-xs text-slate-400">{t.category_label}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => openEdit(t)} className="rounded px-2 py-1 text-xs text-medical-300 hover:bg-white/5">Edit</button>
                    <button onClick={() => remove(t)} className="rounded p-1.5 text-slate-400 hover:bg-white/5 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-300">{t.test_names.join(", ")}</p>
              <div className="mt-2 flex gap-2 text-[11px] text-slate-400">
                <span>{t.test_names.length} tests</span>
                {t.tat_hours != null && <span>· SLA {t.tat_hours}h</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{editing ? "Edit panel" : "New panel"}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Panel name *" value={name} onChange={(e) => setName(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
                <input className={inputCls} placeholder="SLA hours" value={tatHours} inputMode="numeric" onChange={(e) => setTatHours(e.target.value.replace(/\D/g, ""))} />
              </div>
              <input className={inputCls} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="rounded-xl bg-white/5 p-1">
                <TestTagInput value={tests} onChange={setTests} labId={labId} />
              </div>
              <button onClick={save} disabled={!name.trim() || tests.length === 0 || saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Update panel" : "Create panel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
