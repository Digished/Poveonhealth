"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Check, Workflow, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { DEFAULT_DEPARTMENTS, WORKFLOWS, stageLabel, type WorkflowType } from "@/lib/lims-shared";

type Row = { name: string; workflow: WorkflowType; categories: string };

const WORKFLOW_OPTIONS: { value: WorkflowType; label: string }[] = [
  { value: "specimen", label: "Specimen (collected sample)" },
  { value: "imaging", label: "Imaging / procedure (done on patient)" },
  { value: "procedure", label: "Procedure (no scheduling)" },
];

function toRows(departments: { name: string; workflow: string; categories: unknown }[]): Row[] {
  return departments.map((d) => ({
    name: d.name,
    workflow: (d.workflow as WorkflowType) || "specimen",
    categories: Array.isArray(d.categories) ? (d.categories as string[]).join(", ") : "",
  }));
}

/**
 * Lets a lab owner configure how tests are grouped into department pipelines.
 * Each department has a name, a workflow (which pipeline stages it follows), and
 * a set of keywords matched against each test's category to route it here.
 */
export function DepartmentsManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customized, setCustomized] = useState(false);

  useEffect(() => {
    fetch("/api/lab/departments", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.departments) { setRows(toRows(d.departments)); setCustomized(!!d.customized); }
      })
      .catch(() => toast.error("Failed to load departments"))
      .finally(() => setLoading(false));
  }, []);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const add = () => setRows((prev) => [...prev, { name: "", workflow: "specimen", categories: "" }]);
  const loadDefaults = () => { setRows(toRows(DEFAULT_DEPARTMENTS)); toast("Loaded the default 2-department setup — review and save."); };

  async function save() {
    const departments = rows.map((r) => ({
      name: r.name.trim(),
      workflow: r.workflow,
      categories: r.categories.split(",").map((s) => s.trim()).filter(Boolean),
    }));
    if (departments.some((d) => !d.name)) { toast.error("Every department needs a name"); return; }
    const names = departments.map((d) => d.name.toLowerCase());
    if (new Set(names).size !== names.length) { toast.error("Department names must be unique"); return; }
    if (departments.length === 0) { toast.error("Add at least one department"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/lab/departments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departments }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "Failed");
      toast.success("Departments saved");
      setCustomized(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>;
  }

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Workflow className="h-5 w-5 text-medical-300" /> Departments</h2>
        <p className="mt-1 text-sm text-slate-400">
          Decide how tests group into pipelines. A test is routed to the first department whose keywords match its
          category — <span className="text-slate-300">Laboratory</span> acts as the catch-all. {customized ? "" : "You're currently using the built-in defaults."}
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const stages = WORKFLOWS[r.workflow] ?? WORKFLOWS.specimen;
          return (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="sm:w-48">
                  <label className="mb-1 block text-xs font-medium text-slate-400">Department name</label>
                  <input className={inputCls} value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="e.g. Laboratory" />
                </div>
                <div className="sm:w-64">
                  <label className="mb-1 block text-xs font-medium text-slate-400">Pipeline</label>
                  <select className={inputCls} value={r.workflow} onChange={(e) => update(i, { workflow: e.target.value as WorkflowType })}>
                    {WORKFLOW_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-400">Routing keywords (comma-separated)</label>
                  <input className={inputCls} value={r.categories} onChange={(e) => update(i, { categories: e.target.value })} placeholder="blood, urine, swab, fbc, chemistry…" />
                </div>
                <button onClick={() => remove(i)} className="mt-1 inline-flex items-center gap-1 self-start rounded-lg border border-white/10 px-2 py-2 text-xs text-rose-300 hover:bg-white/5 sm:mt-6" title="Remove department">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Stages: {stages.map((s) => stageLabel(s)).join(" → ")}
              </p>
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-sm text-slate-400">No departments yet — add one or load the defaults.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={add} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5">
          <Plus className="h-4 w-4" /> Add department
        </button>
        <button onClick={loadDefaults} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5">
          <RotateCcw className="h-4 w-4" /> Load defaults
        </button>
        <div className="flex-1" />
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save departments
        </button>
      </div>
    </div>
  );
}
