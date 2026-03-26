"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import {
  X, Upload, Download, Plus, RefreshCw, Trash2, Search,
  Check, AlertCircle, ChevronDown, Percent, Sparkles,
} from "lucide-react";
import type { Lab } from "@/lib/types";

type CatalogTest = {
  id: string;
  raw_name: string;
  category_label: string | null;
  synonyms: string[];
  catalog_test_id: string | null;
  lab_price: number;
  commission_pct: number | null;
  poveon_fee: number | null;
  is_active: boolean;
};

type Summary = { total: number; mapped: number; unresolved: number };

function rowColor(t: CatalogTest): string {
  if (!t.is_active) return "opacity-40";
  if (t.synonyms.length <= 1) return "border-l-2 border-l-amber-400";
  return "border-l-2 border-l-emerald-500";
}

// ─── Inline editable number ───────────────────────────────────────────────────
function EditableNumber({
  value, onSave, prefix = "", suffix = "",
}: {
  value: number | null; onSave: (v: number) => Promise<void>; prefix?: string; suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  useEffect(() => { setDraft(String(value ?? "")); }, [value]);

  async function commit() {
    const n = parseFloat(draft);
    if (isNaN(n) || n < 0) { setEditing(false); setDraft(String(value ?? "")); return; }
    setEditing(false);
    await onSave(n);
  }

  if (editing) {
    return (
      <input ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(String(value ?? "")); } }}
        className="w-24 bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    );
  }
  return (
    <button onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
      className="text-sm text-white font-mono hover:text-blue-300 transition-colors text-left" title="Click to edit">
      {prefix}{value != null ? value.toLocaleString() : "—"}{suffix}
    </button>
  );
}

// ─── Inline editable text ─────────────────────────────────────────────────────
function InlineText({
  value, placeholder, onSave, className = "",
}: {
  value: string; placeholder: string; onSave: (v: string) => Promise<void>; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  async function commit() {
    setEditing(false);
    if (draft.trim() !== value) await onSave(draft.trim());
  }

  if (editing) {
    return (
      <input ref={ref} value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(value); } }}
        className={`w-full bg-white/10 border border-white/20 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${className}`}
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)} title="Click to edit"
      className={`text-xs text-left truncate block w-full hover:text-blue-300 transition-colors ${value ? "text-slate-300" : "text-slate-600 italic"} ${className}`}>
      {value || placeholder}
    </button>
  );
}

// ─── Synonyms display ─────────────────────────────────────────────────────────
function SynonymTags({ synonyms, rawName }: { synonyms: string[]; rawName: string }) {
  const [expanded, setExpanded] = useState(false);
  const others = synonyms.filter((s) => s.toLowerCase() !== rawName.toLowerCase());
  if (others.length === 0) return <span className="text-xs text-slate-600 italic">none yet</span>;
  const visible = expanded ? others : others.slice(0, 3);
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((s) => (
        <span key={s} className="text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 px-1.5 py-0.5 rounded-full">{s}</span>
      ))}
      {others.length > 3 && (
        <button onClick={() => setExpanded((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-0.5">
          {expanded ? "less" : `+${others.length - 3} more`}
          <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LabCatalogSheet({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const [tests, setTests] = useState<CatalogTest[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, mapped: 0, unresolved: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const [synonymFilter, setSynonymFilter] = useState<"all" | "has-synonyms" | "no-synonyms">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Bulk commission modal
  const [showBulkComm, setShowBulkComm] = useState(false);
  const [bulkCommValue, setBulkCommValue] = useState("");
  const [bulkCommitting, setBulkCommitting] = useState(false);

  // Bulk synonym generation progress
  const [synGenProgress, setSynGenProgress] = useState<{ current: number; total: number } | null>(null);

  // Add row form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addComm, setAddComm] = useState("");
  const [adding, setAdding] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog`);
      const data = await res.json();
      if (data.success) { setTests(data.tests); setSummary(data.summary); }
    } catch { toast.error("Failed to load catalog"); }
    finally { setLoading(false); }
  }, [lab.id]);

  useEffect(() => { load(); }, [load]);

  // Derived categories list
  const categories = Array.from(
    new Set(tests.map((t) => t.category_label).filter((c): c is string => !!c))
  ).sort();

  const displayed = tests.filter((t) => {
    if (synonymFilter === "has-synonyms" && t.synonyms.length <= 1) return false;
    if (synonymFilter === "no-synonyms" && t.synonyms.length > 1) return false;
    if (categoryFilter && t.category_label !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !t.raw_name.toLowerCase().includes(q) &&
        !(t.category_label ?? "").toLowerCase().includes(q) &&
        !t.synonyms.some((s) => s.toLowerCase().includes(q))
      ) return false;
    }
    return true;
  });

  const allDisplayedSelected = displayed.length > 0 && displayed.every((t) => selectedIds.has(t.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allDisplayedSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        displayed.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        displayed.forEach((t) => next.add(t.id));
        return next;
      });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (data.success) {
        const { created, updated, errors } = data.results;
        toast.success(`${created} added · ${updated} updated${errors ? ` · ${errors} errors` : ""}`);
        await load();
      } else {
        toast.error(data.error ?? "Upload failed");
      }
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleRegenerateSynonyms(testId: string) {
    setResolvingId(testId);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId }),
      });
      const data = await res.json();
      if (data.success) {
        setTests((prev) => prev.map((t) => t.id === testId ? { ...t, ...data.test, synonyms: data.test.synonyms ?? t.synonyms } : t));
        toast.success("Synonyms regenerated");
      }
    } catch { toast.error("Failed"); }
    finally { setResolvingId(null); }
  }

  /** Sequentially generate synonyms for all tests with none, showing progress */
  async function handleBulkGenerateSynonyms() {
    const needsSynonyms = tests.filter((t) => t.synonyms.length <= 1);
    if (needsSynonyms.length === 0) { toast("All tests already have synonyms"); return; }
    setSynGenProgress({ current: 0, total: needsSynonyms.length });
    let done = 0;
    for (const t of needsSynonyms) {
      try {
        const res = await fetch(`/api/admin/labs/${lab.id}/catalog/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId: t.id }),
        });
        const data = await res.json();
        if (data.success) {
          setTests((prev) => prev.map((p) => p.id === t.id ? { ...p, ...data.test, synonyms: data.test.synonyms ?? p.synonyms } : p));
        }
      } catch { /* continue on individual failure */ }
      done++;
      setSynGenProgress({ current: done, total: needsSynonyms.length });
    }
    setSynGenProgress(null);
    toast.success(`Synonyms generated for ${needsSynonyms.length} tests`);
  }

  async function handleDelete(testId: string) {
    setDeletingId(testId);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/${testId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setTests((prev) => prev.filter((t) => t.id !== testId));
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(testId); return next; });
        setSummary((s) => ({ ...s, total: s.total - 1 }));
        toast.success("Removed");
      }
    } catch { toast.error("Delete failed"); }
    finally { setDeletingId(null); }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} test${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        setTests((prev) => prev.filter((t) => !selectedIds.has(t.id)));
        setSummary((s) => ({ ...s, total: s.total - data.deleted }));
        setSelectedIds(new Set());
        toast.success(`${data.deleted} test${data.deleted > 1 ? "s" : ""} deleted`);
      } else {
        toast.error("Bulk delete failed");
      }
    } catch { toast.error("Bulk delete failed"); }
    finally { setBulkDeleting(false); }
  }

  async function handleBulkCommission(e: React.FormEvent) {
    e.preventDefault();
    const commission_pct = parseFloat(bulkCommValue);
    if (isNaN(commission_pct) || commission_pct < 0 || commission_pct > 100) {
      toast.error("Enter a valid commission %"); return;
    }
    // Apply to all selected IDs
    const ids = Array.from(selectedIds);
    if (ids.length === 0) { toast.error("No tests selected"); return; }
    setBulkCommitting(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_commission", ids, commission_pct }),
      });
      const data = await res.json();
      if (data.success) {
        await load();
        setShowBulkComm(false);
        setBulkCommValue("");
        toast.success(`Commission updated for ${data.updated} tests`);
      } else {
        toast.error("Failed to update commission");
      }
    } catch { toast.error("Failed"); }
    finally { setBulkCommitting(false); }
  }

  async function handleFieldUpdate(
    testId: string,
    field: "lab_price" | "commission_pct" | "category_label" | "raw_name",
    value: number | string
  ) {
    const res = await fetch(`/api/admin/labs/${lab.id}/catalog/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    if (data.success) {
      setTests((prev) => prev.map((t) => t.id === testId ? { ...t, ...data.test, synonyms: data.test.synonyms ?? t.synonyms } : t));
    } else {
      toast.error(data.error ?? "Failed to update");
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(addPrice);
    if (!addName.trim() || isNaN(price) || price <= 0) { toast.error("Name and valid price required"); return; }
    setAdding(true);
    try {
      const body: Record<string, unknown> = { raw_name: addName.trim(), lab_price: price };
      if (addCategory.trim()) body.category_label = addCategory.trim();
      if (addComm) body.commission_pct = parseFloat(addComm);
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Test added");
        setAddName(""); setAddCategory(""); setAddPrice(""); setAddComm("");
        setShowAddForm(false);
        await load();
      } else {
        toast.error(data.error ?? "Failed");
      }
    } catch { toast.error("Failed"); }
    finally { setAdding(false); }
  }

  const selectedCount = selectedIds.size;
  const noSynonymCount = tests.filter((t) => t.is_active && t.synonyms.length <= 1).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ backgroundColor: "rgba(2,6,23,0.92)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-7xl bg-slate-900 border border-white/10 rounded-b-3xl shadow-2xl flex flex-col h-screen max-h-screen">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-white truncate">{lab.name} — Test Catalog</h2>
            <div className="flex items-center gap-4 mt-0.5">
              <span className="text-xs text-slate-500">{summary.total} tests</span>
              <span className="text-xs text-emerald-400">{summary.total - summary.unresolved} with synonyms</span>
              {summary.unresolved > 0 && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{summary.unresolved} need synonyms
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {/* Bulk generate synonyms */}
            {noSynonymCount > 0 && (
              <button
                onClick={handleBulkGenerateSynonyms}
                disabled={!!synGenProgress}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs transition-colors disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {synGenProgress
                  ? `Generating ${synGenProgress.current}/${synGenProgress.total}...`
                  : `Generate ${noSynonymCount} missing`}
              </button>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleUpload} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs transition-colors disabled:opacity-50">
              <Upload className="w-3.5 h-3.5" />{uploading ? "Uploading..." : "Upload"}
            </button>
            <button onClick={() => window.open(`/api/admin/labs/${lab.id}/catalog/export`, "_blank")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-xs transition-colors">
              <Download className="w-3.5 h-3.5" />Export
            </button>
            <button onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs transition-colors">
              <Plus className="w-3.5 h-3.5" />Add Row
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Upload hint ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-2 bg-blue-500/5 border-b border-white/5 shrink-0">
          <p className="text-xs text-slate-500">
            Accepts <span className="font-mono text-slate-400">.csv</span>, <span className="font-mono text-slate-400">.xlsx</span>, <span className="font-mono text-slate-400">.xls</span> (all sheets merged) ·
            Columns: <span className="font-mono text-slate-400">test_name, price, category (opt), commission_pct (opt)</span>
            <span className="ml-2 text-slate-600">— AI generates synonyms automatically</span>
          </p>
        </div>

        {/* ── Add row form ────────────────────────────────────────────────────── */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="flex items-center gap-2 px-5 py-3 border-b border-white/10 bg-emerald-500/5 shrink-0 flex-wrap">
            <input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Test name *"
              className="flex-1 min-w-[160px] bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <input value={addCategory} onChange={(e) => setAddCategory(e.target.value)} placeholder="Category (optional)"
              className="w-40 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <input value={addPrice} onChange={(e) => setAddPrice(e.target.value)} placeholder="Lab price *" type="number" min="0" step="0.01"
              className="w-28 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <input value={addComm} onChange={(e) => setAddComm(e.target.value)} placeholder="Comm % (opt)" type="number" min="0" max="100" step="0.1"
              className="w-24 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            <button type="submit" disabled={adding}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
              <Check className="w-3.5 h-3.5" />{adding ? "Adding..." : "Add"}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="p-1.5 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ── Bulk action bar (shown when rows selected) ───────────────────────── */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/10 bg-blue-500/5 shrink-0 flex-wrap">
            <span className="text-xs text-blue-400 font-medium">{selectedCount} selected</span>
            <button onClick={() => setShowBulkComm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs transition-colors">
              <Percent className="w-3 h-3" />Set Commission %
            </button>
            <button onClick={handleBulkDelete} disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs transition-colors disabled:opacity-50">
              <Trash2 className="w-3 h-3" />{bulkDeleting ? "Deleting..." : `Delete ${selectedCount}`}
            </button>
            <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-slate-500 hover:text-white">
              Clear selection
            </button>
          </div>
        )}

        {/* ── Bulk commission form ─────────────────────────────────────────────── */}
        {showBulkComm && selectedCount > 0 && (
          <form onSubmit={handleBulkCommission}
            className="flex items-center gap-3 px-5 py-2.5 border-b border-amber-500/20 bg-amber-500/5 shrink-0 flex-wrap">
            <span className="text-xs text-amber-400">Set commission % for {selectedCount} selected test{selectedCount > 1 ? "s" : ""}:</span>
            <input value={bulkCommValue} onChange={(e) => setBulkCommValue(e.target.value)}
              placeholder="e.g. 15" type="number" min="0" max="100" step="0.1"
              className="w-24 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
            <button type="submit" disabled={bulkCommitting}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium disabled:opacity-50">
              <Check className="w-3 h-3" />{bulkCommitting ? "Applying..." : "Apply"}
            </button>
            <button type="button" onClick={() => setShowBulkComm(false)} className="p-1.5 text-slate-500 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {/* ── Filters ──────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5 shrink-0 flex-wrap">
          {/* Synonym filter pills */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 shrink-0">
            {([
              { key: "all", label: "All" },
              { key: "has-synonyms", label: "Has Synonyms" },
              { key: "no-synonyms", label: "No Synonyms" },
            ] as const).map((f) => (
              <button key={f.key} onClick={() => setSynonymFilter(f.key)}
                className={`px-3 py-1 rounded-md text-xs transition-colors ${synonymFilter === f.key ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Category filter dropdown */}
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 shrink-0"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, category, synonyms..."
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none" />
          </div>

          <button onClick={load} className="p-1.5 text-slate-500 hover:text-white transition-colors shrink-0" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <p className="text-xs text-slate-600 shrink-0">{displayed.length} shown</p>
        </div>

        {/* ── Table ────────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading catalog...</div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
              <p className="text-sm">No tests found</p>
              <p className="text-xs">Upload a CSV/Excel file or add rows manually</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2.5 w-8">
                    <input type="checkbox" checked={allDisplayedSelected} onChange={toggleSelectAll}
                      className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-blue-500 cursor-pointer" />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-400 w-4"></th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Test Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Category</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Synonyms</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Lab Price (₦)</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Comm %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Poveon Fee (₦)</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((t) => (
                  <tr key={t.id}
                    className={`border-b border-white/5 hover:bg-white/3 transition-colors ${rowColor(t)} ${selectedIds.has(t.id) ? "bg-blue-500/5" : ""}`}>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)}
                        className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-blue-500 cursor-pointer" />
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${t.synonyms.length > 1 ? "bg-emerald-500" : "bg-amber-400"}`} />
                    </td>
                    <td className="px-4 py-2.5 font-medium max-w-[200px]">
                      <InlineText
                        value={t.raw_name}
                        placeholder="Test name"
                        onSave={(v) => handleFieldUpdate(t.id, "raw_name", v)}
                        className="text-sm text-white"
                      />
                    </td>
                    <td className="px-4 py-2.5 max-w-[140px]">
                      <InlineText
                        value={t.category_label ?? ""}
                        placeholder="Add category"
                        onSave={(v) => handleFieldUpdate(t.id, "category_label", v)}
                      />
                    </td>
                    <td className="px-4 py-2.5 max-w-[260px]">
                      <SynonymTags synonyms={t.synonyms} rawName={t.raw_name} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EditableNumber value={t.lab_price} onSave={(v) => handleFieldUpdate(t.id, "lab_price", v)} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EditableNumber value={t.commission_pct} onSave={(v) => handleFieldUpdate(t.id, "commission_pct", v)} suffix="%" />
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-mono text-slate-400">
                      {t.poveon_fee != null ? `₦${t.poveon_fee.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleRegenerateSynonyms(t.id)} disabled={resolvingId === t.id || !!synGenProgress}
                          title="Regenerate synonyms via AI"
                          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-blue-400 transition-colors disabled:opacity-40">
                          <RefreshCw className={`w-3 h-3 ${resolvingId === t.id ? "animate-spin" : ""}`} />
                        </button>
                        <button onClick={() => handleDelete(t.id)} disabled={deletingId === t.id}
                          title="Remove from catalog"
                          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Summary panel ────────────────────────────────────────────────────── */}
        {!loading && tests.length > 0 && (() => {
          const active = tests.filter((t) => t.is_active);
          const withSynonyms = active.filter((t) => t.synonyms.length > 1);
          const noSynonyms = active.filter((t) => t.synonyms.length <= 1);
          const synPct = active.length > 0 ? ((withSynonyms.length / active.length) * 100).toFixed(1) : "0";
          const avgPrice = active.length > 0 ? active.reduce((a, t) => a + t.lab_price, 0) / active.length : 0;
          const avgComm = active.filter((t) => t.commission_pct != null).reduce((a, t, _, arr) => a + (t.commission_pct ?? 0) / arr.length, 0);
          const totalRevenue = active.reduce((a, t) => a + (t.poveon_fee ?? 0), 0);
          const totalLabValue = active.reduce((a, t) => a + t.lab_price, 0);

          return (
            <div className="border-t border-white/10 bg-slate-950/60 shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-white/5">
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500 mb-0.5">Total Tests</p>
                  <p className="text-lg font-bold text-white font-mono">{active.length}</p>
                  <p className="text-xs text-slate-600">{tests.length - active.length} inactive</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500 mb-0.5">With Synonyms</p>
                  <p className="text-lg font-bold text-emerald-400 font-mono">{withSynonyms.length}</p>
                  <p className="text-xs text-slate-600">{synPct}% of active</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500 mb-0.5">Need Synonyms</p>
                  <p className={`text-lg font-bold font-mono ${noSynonyms.length > 0 ? "text-amber-400" : "text-slate-500"}`}>{noSynonyms.length}</p>
                  <p className="text-xs text-slate-600">{noSynonyms.length > 0 ? "use Generate button" : "all good"}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500 mb-0.5">Avg Lab Price</p>
                  <p className="text-lg font-bold text-white font-mono">₦{Math.round(avgPrice).toLocaleString()}</p>
                  <p className="text-xs text-slate-600">per test</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-500 mb-0.5">Avg Commission</p>
                  <p className="text-lg font-bold text-amber-400 font-mono">{avgComm.toFixed(1)}%</p>
                  <p className="text-xs text-slate-600">across all tests</p>
                </div>
                <div className="px-4 py-3 bg-emerald-500/5">
                  <p className="text-xs text-emerald-600 mb-0.5">Est. Poveon Revenue</p>
                  <p className="text-lg font-bold text-emerald-400 font-mono">₦{Math.round(totalRevenue).toLocaleString()}</p>
                  <p className="text-xs text-slate-600">if all run once · ₦{Math.round(totalLabValue).toLocaleString()} lab value</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
