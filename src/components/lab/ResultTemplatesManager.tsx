"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, Plus, Trash2, FileText, X, Upload, Wand2, Download, Table, LayoutGrid, Save } from "lucide-react";
import toast from "react-hot-toast";
import { DEPARTMENTS } from "@/lib/lims-shared";
import type { TemplateParam } from "@/lib/result-template-shared";

const SAMPLE_CSV = `template,department,group,parameter,unit,reference_range,loinc,test_code,specimen
Full Blood Count (FBC),Hematology,,Haemoglobin,g/dL,M 13-17 / F 12-15,718-7,HB,Whole blood
Full Blood Count (FBC),Hematology,,White Cell Count,x10^9/L,4.0-11.0,6690-2,WBC,Whole blood
Lipid Profile,Chemistry,,Total Cholesterol,mg/dL,< 200,2093-3,CHOL,Serum
Lipid Profile,Chemistry,,HDL Cholesterol,mg/dL,> 40,2085-9,HDL,Serum
`;

type Param = TemplateParam;
interface ResultTemplate {
  id: string;
  name: string;
  department: string | null;
  parameters: Param[];
  interpretation: string | null;
}

const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";
const cellCls = "w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white placeholder:text-slate-600 focus:border-medical-400 focus:outline-none";

const emptyParam = (): Param => ({ name: "", unit: "", reference_range: "", group: "", loinc: "", test_code: "", specimen: "" });

// One flat, editable spreadsheet row (a single parameter within a template).
interface GridRow extends Param { key: string; template: string; department: string }
let gridKeySeq = 0;
const newKey = () => `r${gridKeySeq++}`;

export function ResultTemplatesManager({ canManage }: { canManage: boolean }) {
  const [templates, setTemplates] = useState<ResultTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ResultTemplate | null>(null);
  const [view, setView] = useState<"cards" | "grid">("cards");

  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [params, setParams] = useState<Param[]>([emptyParam()]);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Grid state — preserves each template's interpretation (not shown in the grid).
  const [grid, setGrid] = useState<GridRow[]>([]);
  const [gridDirty, setGridDirty] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);
  const interpRef = useRef<Map<string, string | null>>(new Map());

  const buildGrid = useCallback((tpls: ResultTemplate[]) => {
    const rows: GridRow[] = [];
    const interp = new Map<string, string | null>();
    for (const t of tpls) {
      interp.set(t.name.trim().toLowerCase(), t.interpretation ?? null);
      const ps = t.parameters.length ? t.parameters : [emptyParam()];
      for (const p of ps) {
        rows.push({ key: newKey(), template: t.name, department: t.department ?? "", name: p.name, unit: p.unit ?? "", reference_range: p.reference_range ?? "", group: p.group ?? "", loinc: p.loinc ?? "", test_code: p.test_code ?? "", specimen: p.specimen ?? "" });
      }
    }
    interpRef.current = interp;
    setGrid(rows);
    setGridDirty(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/result-templates", { cache: "no-store" });
      const data = await res.json();
      const tpls: ResultTemplate[] = data.templates ?? [];
      setTemplates(tpls);
      buildGrid(tpls);
    } catch {
      toast.error("Failed to load result templates");
    } finally {
      setLoading(false);
    }
  }, [buildGrid]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null); setName(""); setDepartment(""); setInterpretation("");
    setParams([emptyParam()]); setShowForm(true);
  }
  function openEdit(t: ResultTemplate) {
    setEditing(t); setName(t.name); setDepartment(t.department ?? ""); setInterpretation(t.interpretation ?? "");
    setParams(t.parameters.length ? t.parameters.map((p) => ({ ...emptyParam(), ...p })) : [emptyParam()]);
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

  async function seedStandard() {
    if (!confirm("Add the standard set of result templates (FBC, Lipid Profile, LFT, U&E, etc.)? Existing templates with the same name are kept.")) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/lab/result-templates/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(data.created > 0 ? `Added ${data.created} template${data.created === 1 ? "" : "s"}${data.skipped ? ` (${data.skipped} already existed)` : ""}` : "All standard templates already present");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to seed");
    } finally {
      setSeeding(false);
    }
  }

  async function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setImporting(true);
    try {
      const csv = await file.text();
      const res = await fetch("/api/lab/result-templates/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      toast.success(`Imported ${data.templates} template${data.templates === 1 ? "" : "s"} (${data.created} new, ${data.replaced} updated)`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "result-templates-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Export the current templates as a CSV (round-trips with Import CSV). */
  function exportCsv() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = "template,department,group,parameter,unit,reference_range,loinc,test_code,specimen";
    const lines = [header];
    for (const t of templates) {
      for (const p of (t.parameters.length ? t.parameters : [emptyParam()])) {
        lines.push([t.name, t.department ?? "", p.group ?? "", p.name, p.unit ?? "", p.reference_range ?? "", p.loinc ?? "", p.test_code ?? "", p.specimen ?? ""].map((v) => esc(String(v))).join(","));
      }
    }
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "result-templates.csv";
    a.click();
    URL.revokeObjectURL(url);
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

  // ── Grid editing ───────────────────────────────────────────────────────────
  function setCell(key: string, patch: Partial<GridRow>) {
    setGrid((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setGridDirty(true);
  }
  function addRow(afterKey?: string) {
    setGrid((prev) => {
      const idx = afterKey ? prev.findIndex((r) => r.key === afterKey) : prev.length - 1;
      const src = idx >= 0 ? prev[idx] : undefined;
      // Inherit template/department so consecutive parameters are quick to add.
      const row: GridRow = { key: newKey(), template: src?.template ?? "", department: src?.department ?? "", name: "", unit: "", reference_range: "", group: "", loinc: "", test_code: "", specimen: "" };
      const next = [...prev];
      next.splice(idx >= 0 ? idx + 1 : prev.length, 0, row);
      return next;
    });
    setGridDirty(true);
  }
  function removeRow(key: string) {
    setGrid((prev) => prev.filter((r) => r.key !== key));
    setGridDirty(true);
  }

  async function saveGrid() {
    // Group rows into templates by name (CSV semantics: template repeats per row).
    const order: string[] = [];
    const map = new Map<string, { name: string; department: string; parameters: Param[] }>();
    for (const r of grid) {
      const tName = r.template.trim();
      const pName = r.name.trim();
      if (!tName || !pName) continue; // skip incomplete rows silently
      const key = tName.toLowerCase();
      if (!map.has(key)) { order.push(key); map.set(key, { name: tName, department: "", parameters: [] }); }
      const g = map.get(key)!;
      if (!g.department && r.department.trim()) g.department = r.department.trim();
      g.parameters.push({ name: pName, unit: r.unit.trim(), reference_range: r.reference_range.trim(), group: r.group.trim(), loinc: (r.loinc ?? "").trim(), test_code: (r.test_code ?? "").trim(), specimen: (r.specimen ?? "").trim() });
    }
    const payloadTemplates = order.map((k) => {
      const g = map.get(k)!;
      const interp = interpRef.current.get(k);
      return { name: g.name, department: g.department || undefined, interpretation: interp || undefined, parameters: g.parameters };
    });
    if (payloadTemplates.length === 0) { toast.error("Add at least one row with a template name and parameter"); return; }

    setSavingGrid(true);
    try {
      const res = await fetch("/api/lab/result-templates/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates: payloadTemplates, prune: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(`Saved · ${data.created} new, ${data.updated} updated${data.deleted ? `, ${data.deleted} removed` : ""}`);
      const tpls: ResultTemplate[] = data.templates ?? [];
      setTemplates(tpls);
      buildGrid(tpls);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingGrid(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-white"><FileText className="h-4 w-4 text-medical-300" /> Result report templates</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="inline-flex overflow-hidden rounded-lg border border-white/10">
            <button onClick={() => setView("cards")} className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === "cards" ? "bg-medical-600 text-white" : "text-slate-300 hover:bg-white/5"}`}><LayoutGrid className="h-3.5 w-3.5" /> Cards</button>
            <button onClick={() => setView("grid")} className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === "grid" ? "bg-medical-600 text-white" : "text-slate-300 hover:bg-white/5"}`}><Table className="h-3.5 w-3.5" /> Spreadsheet</button>
          </div>
          {canManage && (
            <>
              <button onClick={seedStandard} disabled={seeding} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50">
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} Seed standard
              </button>
              <button onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50">
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Import CSV
              </button>
              <button onClick={exportCsv} disabled={templates.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50" title="Download all templates as CSV">
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
              <button onClick={downloadSample} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200" title="Download a sample CSV">
                <Download className="h-3.5 w-3.5" /> Sample
              </button>
              {view === "cards" && <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700"><Plus className="h-3.5 w-3.5" /> New template</button>}
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onCsvFile} className="hidden" />
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : view === "grid" ? (
        <GridEditor
          grid={grid} canManage={canManage} dirty={gridDirty} saving={savingGrid}
          onCell={setCell} onAddRow={addRow} onRemoveRow={removeRow} onSave={saveGrid} onReset={() => buildGrid(templates)}
        />
      ) : templates.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-sm text-slate-400">No result templates yet. Define a report (e.g. FBC) with parameters &amp; reference ranges.</p>
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
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
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
                <div className="space-y-3">
                  {params.map((p, i) => (
                    <div key={i} className="rounded-xl border border-white/10 p-2">
                      <div className="grid grid-cols-12 gap-2">
                        <input className={`${inputCls} col-span-4`} placeholder="Parameter" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} />
                        <input className={`${inputCls} col-span-2`} placeholder="Unit" value={p.unit} onChange={(e) => setParam(i, { unit: e.target.value })} />
                        <input className={`${inputCls} col-span-3`} placeholder="Ref range" value={p.reference_range} onChange={(e) => setParam(i, { reference_range: e.target.value })} />
                        <input className={`${inputCls} col-span-2`} placeholder="Group" value={p.group} onChange={(e) => setParam(i, { group: e.target.value })} />
                        <button onClick={() => setParams((prev) => prev.filter((_, idx) => idx !== i))} className="col-span-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-2 grid grid-cols-12 gap-2">
                        <input className={`${inputCls} col-span-4`} placeholder="LOINC (optional)" value={p.loinc ?? ""} onChange={(e) => setParam(i, { loinc: e.target.value })} />
                        <input className={`${inputCls} col-span-4`} placeholder="Test code (optional)" value={p.test_code ?? ""} onChange={(e) => setParam(i, { test_code: e.target.value })} />
                        <input className={`${inputCls} col-span-4`} placeholder="Specimen (optional)" value={p.specimen ?? ""} onChange={(e) => setParam(i, { specimen: e.target.value })} />
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setParams((prev) => [...prev, emptyParam()])} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"><Plus className="h-3.5 w-3.5" /> Add parameter</button>
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

function GridEditor({ grid, canManage, dirty, saving, onCell, onAddRow, onRemoveRow, onSave, onReset }: {
  grid: GridRow[];
  canManage: boolean;
  dirty: boolean;
  saving: boolean;
  onCell: (key: string, patch: Partial<GridRow>) => void;
  onAddRow: (afterKey?: string) => void;
  onRemoveRow: (key: string) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const ro = !canManage;
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Edit every template as one sheet — one row per parameter, repeat the template name down the rows. Empty rows are ignored; saving replaces the lab&apos;s template set.</p>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-[900px] w-full text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-[10px] uppercase tracking-wide text-slate-400">
              <th className="px-2 py-2 font-semibold">Template</th>
              <th className="px-2 py-2 font-semibold">Department</th>
              <th className="px-2 py-2 font-semibold">Group</th>
              <th className="px-2 py-2 font-semibold">Parameter</th>
              <th className="px-2 py-2 font-semibold">Unit</th>
              <th className="px-2 py-2 font-semibold">Ref range</th>
              <th className="px-2 py-2 font-semibold">LOINC</th>
              <th className="px-2 py-2 font-semibold">Code</th>
              <th className="px-2 py-2 font-semibold">Specimen</th>
              {!ro && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {grid.length === 0 ? (
              <tr><td colSpan={ro ? 9 : 10} className="px-2 py-6 text-center text-sm text-slate-400">No rows yet.</td></tr>
            ) : grid.map((r) => (
              <tr key={r.key} className="border-b border-white/5">
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[140px]`} value={r.template} placeholder="Template" onChange={(e) => onCell(r.key, { template: e.target.value })} /></td>
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[110px]`} value={r.department} placeholder="Dept" onChange={(e) => onCell(r.key, { department: e.target.value })} list="lims-departments" /></td>
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[90px]`} value={r.group} placeholder="—" onChange={(e) => onCell(r.key, { group: e.target.value })} /></td>
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[150px]`} value={r.name} placeholder="Parameter" onChange={(e) => onCell(r.key, { name: e.target.value })} /></td>
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[70px]`} value={r.unit} placeholder="—" onChange={(e) => onCell(r.key, { unit: e.target.value })} /></td>
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[120px]`} value={r.reference_range} placeholder="—" onChange={(e) => onCell(r.key, { reference_range: e.target.value })} /></td>
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[80px]`} value={r.loinc ?? ""} placeholder="—" onChange={(e) => onCell(r.key, { loinc: e.target.value })} /></td>
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[70px]`} value={r.test_code ?? ""} placeholder="—" onChange={(e) => onCell(r.key, { test_code: e.target.value })} /></td>
                <td className="px-1.5 py-1"><input disabled={ro} className={`${cellCls} min-w-[90px]`} value={r.specimen ?? ""} placeholder="—" onChange={(e) => onCell(r.key, { specimen: e.target.value })} /></td>
                {!ro && <td className="px-1.5 py-1"><div className="flex items-center gap-0.5"><button onClick={() => onAddRow(r.key)} title="Add row below" className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-medical-300"><Plus className="h-3.5 w-3.5" /></button><button onClick={() => onRemoveRow(r.key)} title="Delete row" className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></div></td>}
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="lims-departments">{DEPARTMENTS.map((d) => <option key={d} value={d} />)}</datalist>
      </div>
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onAddRow()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5"><Plus className="h-3.5 w-3.5" /> Add row</button>
          <button onClick={onSave} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save changes
          </button>
          {dirty && <button onClick={onReset} disabled={saving} className="text-xs text-slate-400 hover:text-slate-200">Discard</button>}
          {dirty && <span className="text-[11px] text-amber-300">Unsaved changes</span>}
        </div>
      )}
    </div>
  );
}
