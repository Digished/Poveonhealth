"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "react-hot-toast";
import { X, Upload, Download, Plus, RefreshCw, Trash2, Search, Check, AlertCircle } from "lucide-react";
import type { Lab } from "@/lib/types";

type CatalogTest = {
  id: string;
  raw_name: string;
  canonical_name: string | null;
  category: string | null;
  catalog_test_id: string | null;
  lab_price: number;
  commission_pct: number | null;
  poveon_fee: number | null;
  resolution_confidence: number | null;
  resolution_source: string | null;
  is_active: boolean;
};

type Summary = { total: number; mapped: number; unresolved: number };

type CatalogResult = { id: string; canonical_name: string; category_name: string };

function rowColor(t: CatalogTest): string {
  if (!t.is_active) return "opacity-40";
  if (!t.catalog_test_id || (t.resolution_confidence ?? 0) < 0.5) return "border-l-2 border-l-red-500";
  if ((t.resolution_confidence ?? 0) < 0.8) return "border-l-2 border-l-amber-400";
  return "border-l-2 border-l-emerald-500";
}

function confidenceBadge(t: CatalogTest) {
  if (!t.catalog_test_id || (t.resolution_confidence ?? 0) < 0.5) {
    return <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">unresolved</span>;
  }
  if ((t.resolution_confidence ?? 0) < 0.8) {
    return <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">{t.resolution_source ?? "low"}</span>;
  }
  return <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">{t.resolution_source ?? "matched"}</span>;
}

// Inline editable number cell
function EditableNumber({
  value,
  onSave,
  prefix = "",
  suffix = "",
}: {
  value: number | null;
  onSave: (v: number) => Promise<void>;
  prefix?: string;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  async function commit() {
    const n = parseFloat(draft);
    if (isNaN(n) || n < 0) { setEditing(false); setDraft(String(value ?? "")); return; }
    setEditing(false);
    await onSave(n);
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(String(value ?? "")); } }}
        className="w-24 bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    );
  }

  return (
    <button onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
      className="text-sm text-white font-mono hover:text-blue-300 transition-colors text-left"
      title="Click to edit"
    >
      {prefix}{value != null ? value.toLocaleString() : "—"}{suffix}
    </button>
  );
}

// Catalog search + manual mapping popover
function MapPopover({
  labId,
  testId,
  onMapped,
  onClose,
}: {
  labId: string;
  testId: string;
  onMapped: (catalogTestId: string, canonicalName: string, category: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/pricing/tests?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (data.success) {
          setResults(
            (data.tests as { id: string; canonical_name: string; category: { name: string } }[]).slice(0, 8).map((t) => ({
              id: t.id,
              canonical_name: t.canonical_name,
              category_name: t.category.name,
            }))
          );
        }
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function pick(r: CatalogResult) {
    const res = await fetch(`/api/admin/labs/${labId}/catalog/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalog_test_id: r.id }),
    });
    const data = await res.json();
    if (data.success) {
      onMapped(r.id, r.canonical_name, r.category_name);
      toast.success("Mapped to " + r.canonical_name);
    } else {
      toast.error("Failed to map");
    }
    onClose();
  }

  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-slate-800 border border-white/10 rounded-xl shadow-xl p-2">
      <div className="flex items-center gap-2 mb-2">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search catalog tests..."
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
        />
        <button onClick={onClose}><X className="w-3.5 h-3.5 text-slate-500 hover:text-white" /></button>
      </div>
      {loading && <p className="text-xs text-slate-500 px-2 py-1">Searching...</p>}
      {results.map((r) => (
        <button key={r.id} onClick={() => pick(r)}
          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <p className="text-sm text-white">{r.canonical_name}</p>
          <p className="text-xs text-slate-500">{r.category_name}</p>
        </button>
      ))}
      {q.length >= 2 && !loading && results.length === 0 && (
        <p className="text-xs text-slate-500 px-2 py-1">No matches found</p>
      )}
    </div>
  );
}

export default function LabCatalogSheet({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const [tests, setTests] = useState<CatalogTest[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, mapped: 0, unresolved: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mapPopoverId, setMapPopoverId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mapped" | "unresolved">("all");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
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

  const displayed = tests.filter((t) => {
    if (filter === "mapped" && (!t.catalog_test_id || (t.resolution_confidence ?? 0) < 0.5)) return false;
    if (filter === "unresolved" && t.catalog_test_id && (t.resolution_confidence ?? 0) >= 0.5) return false;
    if (search && !t.raw_name.toLowerCase().includes(search.toLowerCase()) && !(t.canonical_name ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

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
        const { created, updated, resolved, unresolved, errors } = data.results;
        toast.success(`${created} added · ${updated} updated · ${resolved} resolved · ${unresolved} unresolved${errors ? ` · ${errors} errors` : ""}`);
        await load();
      } else {
        toast.error(data.error ?? "Upload failed");
      }
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function handleExport() {
    window.open(`/api/admin/labs/${lab.id}/catalog/export`, "_blank");
  }

  async function handleResolve(testId: string) {
    setResolvingId(testId);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId }),
      });
      const data = await res.json();
      if (data.success) {
        setTests((prev) => prev.map((t) => t.id === testId ? { ...t, ...data.test, canonical_name: data.resolved_to ?? t.canonical_name } : t));
        toast.success(data.resolved_to ? `Resolved → ${data.resolved_to}` : "Still unresolved");
      }
    } catch { toast.error("Resolve failed"); }
    finally { setResolvingId(null); }
  }

  async function handleDelete(testId: string) {
    setDeletingId(testId);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog/${testId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setTests((prev) => prev.filter((t) => t.id !== testId));
        setSummary((s) => ({ ...s, total: s.total - 1 }));
        toast.success("Removed");
      }
    } catch { toast.error("Delete failed"); }
    finally { setDeletingId(null); }
  }

  async function handlePriceUpdate(testId: string, field: "lab_price" | "commission_pct", value: number) {
    const res = await fetch(`/api/admin/labs/${lab.id}/catalog/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    if (data.success) {
      setTests((prev) => prev.map((t) => t.id === testId ? { ...t, ...data.test } : t));
    } else {
      toast.error("Failed to update");
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(addPrice);
    if (!addName.trim() || isNaN(price) || price <= 0) { toast.error("Name and valid price required"); return; }
    setAdding(true);
    try {
      const body: Record<string, unknown> = { raw_name: addName.trim(), lab_price: price };
      if (addComm) body.commission_pct = parseFloat(addComm);
      const res = await fetch(`/api/admin/labs/${lab.id}/catalog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Test added");
        setAddName(""); setAddPrice(""); setAddComm(""); setShowAddForm(false);
        await load();
      } else {
        toast.error(data.error ?? "Failed");
      }
    } catch { toast.error("Failed"); }
    finally { setAdding(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{ backgroundColor: "rgba(2,6,23,0.92)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-6xl bg-slate-900 border border-white/10 rounded-b-3xl shadow-2xl flex flex-col h-screen max-h-screen">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-white truncate">{lab.name} — Test Catalog</h2>
            <div className="flex items-center gap-4 mt-0.5">
              <span className="text-xs text-slate-500">{summary.total} tests</span>
              <span className="text-xs text-emerald-400">{summary.mapped} mapped</span>
              {summary.unresolved > 0 && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{summary.unresolved} unresolved
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "Uploading..." : "Upload CSV"}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />Export
            </button>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />Add Row
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* CSV format hint */}
        <div className="px-5 py-2 bg-blue-500/5 border-b border-white/5 shrink-0">
          <p className="text-xs text-slate-500">
            CSV format: <span className="font-mono text-slate-400">test_name, price, commission_pct (optional), is_active (optional)</span>
          </p>
        </div>

        {/* Add row form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-emerald-500/5 shrink-0">
            <input
              value={addName} onChange={(e) => setAddName(e.target.value)}
              placeholder="Test name (e.g. Full Blood Count)"
              className="flex-1 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <input
              value={addPrice} onChange={(e) => setAddPrice(e.target.value)}
              placeholder="Lab price"
              type="number" min="0" step="0.01"
              className="w-28 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <input
              value={addComm} onChange={(e) => setAddComm(e.target.value)}
              placeholder="Comm % (opt)"
              type="number" min="0" max="100" step="0.1"
              className="w-28 bg-white/8 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button type="submit" disabled={adding}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />{adding ? "Adding..." : "Add"}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="p-1.5 text-slate-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
            {(["all", "mapped", "unresolved"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs transition-colors capitalize ${filter === f ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests..."
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
          <button onClick={load} className="p-1.5 text-slate-500 hover:text-white transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <p className="text-xs text-slate-600">{displayed.length} shown</p>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm">Loading catalog...</div>
          ) : displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
              <p className="text-sm">No tests yet</p>
              <p className="text-xs">Upload a CSV or add rows manually</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 bg-slate-900 z-10">
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400 w-6"></th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Raw Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Canonical Match</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-400">Category</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Lab Price (₦)</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Comm %</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Poveon Fee (₦)</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-slate-400">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((t) => (
                  <tr key={t.id} className={`border-b border-white/5 hover:bg-white/3 transition-colors ${rowColor(t)}`}>
                    <td className="px-2 py-2.5 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${
                        !t.catalog_test_id || (t.resolution_confidence ?? 0) < 0.5
                          ? "bg-red-500"
                          : (t.resolution_confidence ?? 0) < 0.8
                          ? "bg-amber-400"
                          : "bg-emerald-500"
                      }`} />
                    </td>
                    <td className="px-4 py-2.5 text-white font-medium max-w-[180px]">
                      <span className="truncate block" title={t.raw_name}>{t.raw_name}</span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <div className="relative">
                        <button
                          onClick={() => setMapPopoverId(mapPopoverId === t.id ? null : t.id)}
                          className={`text-left truncate block w-full text-xs hover:underline ${t.canonical_name ? "text-slate-300" : "text-slate-500 italic"}`}
                          title={t.canonical_name ?? "Click to map"}
                        >
                          {t.canonical_name ?? "Click to map"}
                        </button>
                        {mapPopoverId === t.id && (
                          <MapPopover
                            labId={lab.id}
                            testId={t.id}
                            onMapped={(catalogTestId, canonicalName, category) => {
                              setTests((prev) => prev.map((row) =>
                                row.id === t.id
                                  ? { ...row, catalog_test_id: catalogTestId, canonical_name: canonicalName, category, resolution_source: "manual", resolution_confidence: 1.0 }
                                  : row
                              ));
                            }}
                            onClose={() => setMapPopoverId(null)}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 max-w-[160px]">
                      <span className="truncate block" title={t.category ?? ""}>{t.category ?? "—"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EditableNumber
                        value={t.lab_price}
                        onSave={(v) => handlePriceUpdate(t.id, "lab_price", v)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <EditableNumber
                        value={t.commission_pct}
                        onSave={(v) => handlePriceUpdate(t.id, "commission_pct", v)}
                        suffix="%"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-mono text-slate-400">
                      {t.poveon_fee != null ? `₦${t.poveon_fee.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {confidenceBadge(t)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleResolve(t.id)}
                          disabled={resolvingId === t.id}
                          title="Re-run AI resolution"
                          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-blue-400 transition-colors disabled:opacity-40"
                        >
                          <RefreshCw className={`w-3 h-3 ${resolvingId === t.id ? "animate-spin" : ""}`} />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deletingId === t.id}
                          title="Remove from catalog"
                          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
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

        {/* Footer summary */}
        {!loading && tests.length > 0 && (
          <div className="flex items-center gap-6 px-5 py-3 border-t border-white/10 bg-white/3 shrink-0">
            <span className="text-xs text-slate-500">{summary.total} total</span>
            <span className="text-xs text-emerald-400">{summary.mapped} mapped</span>
            {summary.unresolved > 0 && <span className="text-xs text-red-400">{summary.unresolved} need mapping</span>}
            <span className="text-xs text-slate-600 ml-auto">
              Est. Poveon revenue (if all run once): <span className="text-white font-mono">
                ₦{tests.reduce((a, t) => a + (t.poveon_fee ?? 0), 0).toLocaleString()}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
