"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  FlaskConical, Tag, Building2, AlertCircle, Plus, Pencil, Trash2,
  Check, X, ChevronDown, ChevronRight, RefreshCw, Sparkles, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  _count: { tests: number };
};

type TestSynonym = { id: string; synonym: string };

type CatalogTest = {
  id: string;
  category_id: string;
  canonical_name: string;
  base_price: number;
  is_rapid_test: boolean;
  is_active: boolean;
  synonyms: TestSynonym[];
};

type OverrideRow = {
  id: string;
  canonical_name: string;
  category: string;
  base_price: number;
  override_price: number | null;
  effective_price: number;
  updated_by: string | null;
  updated_at: string | null;
};

type UnmappedItem = {
  id: string;
  raw_name: string;
  occurrence_count: number;
  last_seen_at: string;
  status: string;
};

type Lab = { id: string; name: string };

type PricingTab = "catalog" | "overrides" | "unmapped";

// ── Shared helpers ────────────────────────────────────────────────────────────

const fmt = (n: number) => `₦${n.toLocaleString()}`;
const dark = "bg-slate-800 border-slate-700 text-white placeholder-slate-400 focus:ring-medical-500";

// ── Tab: Test Catalog ─────────────────────────────────────────────────────────

function CatalogTab() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [tests, setTests] = useState<CatalogTest[]>([]);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingTests, setLoadingTests] = useState(false);

  // New category form
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  // New test form
  const [showNewTest, setShowNewTest] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [newTestPrice, setNewTestPrice] = useState("");
  const [newTestRapid, setNewTestRapid] = useState(false);
  const [newTestSyns, setNewTestSyns] = useState("");
  const [savingTest, setSavingTest] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  // Inline price editing
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const fetchCategories = useCallback(async () => {
    setLoadingCats(true);
    const res = await fetch("/api/admin/pricing/categories");
    const data = await res.json();
    setCategories(data.categories ?? []);
    setLoadingCats(false);
  }, []);

  const fetchTests = useCallback(async (catId: string) => {
    setLoadingTests(true);
    const res = await fetch(`/api/admin/pricing/tests?category_id=${catId}`);
    const data = await res.json();
    setTests(data.tests ?? []);
    setLoadingTests(false);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  useEffect(() => {
    if (selectedCat) fetchTests(selectedCat.id);
    else setTests([]);
  }, [selectedCat, fetchTests]);

  async function addCategory() {
    if (!newCatName.trim()) return;
    setAddingCat(true);
    const res = await fetch("/api/admin/pricing/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim(), description: newCatDesc.trim() }),
    });
    if (res.ok) {
      toast.success("Category created");
      setNewCatName(""); setNewCatDesc("");
      fetchCategories();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Failed");
    }
    setAddingCat(false);
  }

  async function addTest() {
    if (!selectedCat || !newTestName.trim()) return;
    setSavingTest(true);
    const synonyms = newTestSyns.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await fetch("/api/admin/pricing/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category_id: selectedCat.id,
        canonical_name: newTestName.trim(),
        base_price: parseFloat(newTestPrice) || 0,
        is_rapid_test: newTestRapid,
        synonyms,
      }),
    });
    if (res.ok) {
      toast.success("Test added");
      setNewTestName(""); setNewTestPrice(""); setNewTestRapid(false); setNewTestSyns("");
      setShowNewTest(false);
      fetchTests(selectedCat.id);
      fetchCategories();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Failed");
    }
    setSavingTest(false);
  }

  async function savePrice(testId: string) {
    const price = parseFloat(priceInput);
    if (isNaN(price)) { toast.error("Invalid price"); return; }
    const res = await fetch("/api/admin/pricing/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: testId, base_price: price }),
    });
    if (res.ok) {
      toast.success("Price updated");
      setEditingPrice(null);
      if (selectedCat) fetchTests(selectedCat.id);
    } else toast.error("Failed to update price");
  }

  async function toggleActive(test: CatalogTest) {
    const res = await fetch("/api/admin/pricing/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: test.id, is_active: !test.is_active }),
    });
    if (res.ok) {
      if (selectedCat) fetchTests(selectedCat.id);
    } else toast.error("Failed");
  }

  async function deleteTest(testId: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/pricing/tests?id=${testId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Test deleted");
      if (selectedCat) { fetchTests(selectedCat.id); fetchCategories(); }
    } else toast.error("Failed to delete");
  }

  async function removeSynonym(testId: string, synId: string) {
    const res = await fetch("/api/admin/pricing/tests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: testId, remove_synonym_ids: [synId] }),
    });
    if (res.ok && selectedCat) fetchTests(selectedCat.id);
  }

  async function aiSuggest() {
    if (!selectedCat) return;
    setAiSuggesting(true);
    const res = await fetch("/api/admin/pricing/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ai_suggest", category_id: selectedCat.id }),
    });
    if (res.ok) {
      const data = await res.json();
      const suggestions = data.suggestions as { name: string; is_rapid_test: boolean; synonyms: string[] }[];
      toast.success(`Got ${suggestions.length} suggestions — adding...`);
      for (const s of suggestions) {
        await fetch("/api/admin/pricing/tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: selectedCat.id,
            canonical_name: s.name,
            base_price: 0,
            is_rapid_test: s.is_rapid_test,
            synonyms: s.synonyms,
          }),
        });
      }
      toast.success("AI suggestions added");
      fetchTests(selectedCat.id);
      fetchCategories();
    } else toast.error("AI suggest failed");
    setAiSuggesting(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!selectedCat) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Test Categories</h3>
          <Button size="sm" variant="secondary" onClick={fetchCategories} loading={loadingCats}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* New category */}
        <div className="bg-slate-700/50 rounded-xl p-4 space-y-2">
          <p className="text-xs text-slate-400 font-medium">Add Category</p>
          <Input
            placeholder="Category name"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className={dark}
          />
          <Input
            placeholder="Description (optional)"
            value={newCatDesc}
            onChange={(e) => setNewCatDesc(e.target.value)}
            className={dark}
          />
          <Button size="sm" onClick={addCategory} loading={addingCat} disabled={!newCatName.trim()}>
            <Plus className="w-3.5 h-3.5" /> Add Category
          </Button>
        </div>

        {loadingCats ? (
          <p className="text-slate-400 text-sm">Loading...</p>
        ) : (
          <div className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-700/50 hover:bg-slate-700 text-left transition-colors"
              >
                <div>
                  <p className="text-white text-sm font-medium">{cat.name}</p>
                  {cat.description && <p className="text-slate-400 text-xs mt-0.5">{cat.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 bg-slate-600 px-2 py-0.5 rounded-full">
                    {cat._count.tests} tests
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Category detail view ──────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedCat(null)} className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="text-white font-semibold flex-1">{selectedCat.name}</h3>
        <Button size="sm" variant="secondary" onClick={aiSuggest} loading={aiSuggesting}>
          <Sparkles className="w-3.5 h-3.5" /> AI Suggest
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setShowNewTest((v) => !v)}>
          <Plus className="w-3.5 h-3.5" /> Add Test
        </Button>
      </div>

      {showNewTest && (
        <div className="bg-slate-700/50 rounded-xl p-4 space-y-2">
          <p className="text-xs text-slate-400 font-medium">New Test</p>
          <Input placeholder="Canonical name e.g. Full Blood Count" value={newTestName}
            onChange={(e) => setNewTestName(e.target.value)} className={dark} />
          <Input placeholder="Base price (₦)" value={newTestPrice} type="number"
            onChange={(e) => setNewTestPrice(e.target.value)} className={dark} />
          <Input placeholder="Synonyms comma-separated e.g. FBC, CBC, Haemogram"
            value={newTestSyns} onChange={(e) => setNewTestSyns(e.target.value)} className={dark} />
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={newTestRapid} onChange={(e) => setNewTestRapid(e.target.checked)}
              className="rounded" />
            Rapid test (bedside)
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={addTest} loading={savingTest} disabled={!newTestName.trim()}>
              <Plus className="w-3.5 h-3.5" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewTest(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loadingTests ? (
        <p className="text-slate-400 text-sm">Loading tests...</p>
      ) : tests.length === 0 ? (
        <p className="text-slate-400 text-sm">No tests yet. Use AI Suggest or add manually.</p>
      ) : (
        <div className="space-y-1">
          {tests.map((test) => (
            <div key={test.id} className={`rounded-xl overflow-hidden ${test.is_active ? "bg-slate-700/50" : "bg-slate-800/30 opacity-60"}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setExpandedTest(expandedTest === test.id ? null : test.id)}
                  className="text-slate-400 hover:text-white flex-shrink-0">
                  {expandedTest === test.id
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium truncate">{test.canonical_name}</span>
                    {test.is_rapid_test && (
                      <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0">rapid</span>
                    )}
                    {!test.is_active && (
                      <span className="text-xs bg-slate-600 text-slate-400 px-1.5 py-0.5 rounded-full flex-shrink-0">inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{test.synonyms.length} synonym{test.synonyms.length !== 1 ? "s" : ""}</p>
                </div>

                {/* Inline price edit */}
                {editingPrice === test.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 text-sm">₦</span>
                    <input
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      className="w-24 bg-slate-600 text-white text-sm px-2 py-1 rounded-lg border border-slate-500 focus:outline-none focus:ring-1 focus:ring-medical-500"
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") savePrice(test.id); if (e.key === "Escape") setEditingPrice(null); }}
                    />
                    <button onClick={() => savePrice(test.id)} className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingPrice(null)} className="text-slate-400 hover:text-slate-300"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingPrice(test.id); setPriceInput(String(test.base_price)); }}
                    className="text-sm text-slate-300 hover:text-white font-mono flex items-center gap-1 group"
                  >
                    {fmt(test.base_price)}
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}

                <button onClick={() => toggleActive(test)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${test.is_active ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-slate-600 text-slate-400 hover:bg-slate-500"}`}>
                  <Check className="w-3 h-3" />
                </button>
                <button onClick={() => deleteTest(test.id, test.canonical_name)}
                  className="text-slate-500 hover:text-red-400 flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {expandedTest === test.id && (
                <div className="px-4 pb-3 border-t border-slate-700/50 pt-2">
                  <p className="text-xs text-slate-400 mb-2 font-medium">Synonyms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {test.synonyms.map((syn) => (
                      <span key={syn.id}
                        className="flex items-center gap-1 text-xs bg-slate-600 text-slate-300 px-2 py-0.5 rounded-full">
                        {syn.synonym}
                        <button onClick={() => removeSynonym(test.id, syn.id)}
                          className="text-slate-400 hover:text-red-400">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Lab Price Overrides ──────────────────────────────────────────────────

function OverridesTab() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [selectedLab, setSelectedLab] = useState<Lab | null>(null);
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/labs")
      .then((r) => r.json())
      .then((d) => setLabs(d.labs ?? []));
  }, []);

  async function loadOverrides(lab: Lab) {
    setSelectedLab(lab);
    setLoading(true);
    const res = await fetch(`/api/admin/pricing/overrides?lab_id=${lab.id}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setLoading(false);
  }

  async function saveOverride(catalogTestId: string) {
    if (!selectedLab) return;
    const price = parseFloat(priceInput);
    if (isNaN(price)) { toast.error("Invalid price"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/pricing/overrides", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lab_id: selectedLab.id, catalog_test_id: catalogTestId, price }),
    });
    if (res.ok) {
      toast.success("Override saved");
      setEditingRow(null);
      loadOverrides(selectedLab);
    } else toast.error("Failed to save");
    setSaving(false);
  }

  async function clearOverride(catalogTestId: string) {
    if (!selectedLab) return;
    const res = await fetch("/api/admin/pricing/overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lab_id: selectedLab.id, catalog_test_id: catalogTestId }),
    });
    if (res.ok) { toast.success("Override cleared"); loadOverrides(selectedLab); }
    else toast.error("Failed");
  }

  async function clearAllOverrides() {
    if (!selectedLab || !confirm(`Clear ALL price overrides for ${selectedLab.name}?`)) return;
    const res = await fetch("/api/admin/pricing/overrides", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lab_id: selectedLab.id }),
    });
    if (res.ok) { toast.success("All overrides cleared"); loadOverrides(selectedLab); }
    else toast.error("Failed");
  }

  const filtered = rows.filter((r) =>
    r.canonical_name.toLowerCase().includes(search.toLowerCase()) ||
    r.category.toLowerCase().includes(search.toLowerCase())
  );

  if (!selectedLab) {
    return (
      <div className="space-y-3">
        <h3 className="text-white font-semibold">Select a Lab</h3>
        {labs.map((lab) => (
          <button key={lab.id} onClick={() => loadOverrides(lab)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-700/50 hover:bg-slate-700 text-left">
            <span className="text-sm text-white">{lab.name}</span>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setSelectedLab(null)} className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="text-white font-semibold flex-1">{selectedLab.name}</h3>
        <Button size="sm" variant="danger" onClick={clearAllOverrides}>
          Clear All
        </Button>
      </div>

      <input
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search test name or category..."
        className="w-full bg-slate-700 border border-slate-600 text-white text-sm px-3 py-2 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-500"
      />

      {loading ? (
        <p className="text-slate-400 text-sm">Loading...</p>
      ) : (
        <div className="space-y-1">
          {/* Header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-1.5 text-xs text-slate-400 font-medium">
            <span>Test · Category</span>
            <span className="text-right w-24">Base</span>
            <span className="text-right w-24">Override</span>
            <span className="text-right w-24">Effective</span>
            <span className="w-16" />
          </div>

          {filtered.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center px-3 py-2.5 rounded-xl bg-slate-700/50 hover:bg-slate-700/70">
              <div>
                <p className="text-sm text-white">{row.canonical_name}</p>
                <p className="text-xs text-slate-500">{row.category}</p>
              </div>

              <span className="text-sm text-slate-400 font-mono w-24 text-right">{fmt(row.base_price)}</span>

              {/* Override price cell */}
              {editingRow === row.id ? (
                <div className="flex items-center gap-1 w-28">
                  <span className="text-slate-400 text-sm">₦</span>
                  <input
                    value={priceInput} onChange={(e) => setPriceInput(e.target.value)}
                    className="w-20 bg-slate-600 text-white text-sm px-2 py-0.5 rounded border border-slate-500 focus:outline-none focus:ring-1 focus:ring-medical-500"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") saveOverride(row.id); if (e.key === "Escape") setEditingRow(null); }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => { setEditingRow(row.id); setPriceInput(String(row.override_price ?? row.base_price)); }}
                  className="text-sm font-mono text-right w-24 group flex items-center justify-end gap-1"
                >
                  {row.override_price !== null
                    ? <span className="text-amber-400">{fmt(row.override_price)} <span className="text-xs text-amber-500">custom</span></span>
                    : <span className="text-slate-500">—</span>}
                  <Pencil className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100" />
                </button>
              )}

              <span className={`text-sm font-mono text-right w-24 ${row.override_price !== null ? "text-amber-300 font-semibold" : "text-slate-300"}`}>
                {fmt(row.effective_price)}
              </span>

              <div className="flex items-center gap-1 w-16 justify-end">
                {editingRow === row.id && (
                  <>
                    <button onClick={() => saveOverride(row.id)} disabled={saving} className="text-emerald-400 hover:text-emerald-300">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingRow(null)} className="text-slate-400 hover:text-slate-300">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
                {row.override_price !== null && editingRow !== row.id && (
                  <button onClick={() => clearOverride(row.id)} className="text-slate-500 hover:text-red-400" title="Reset to base">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Unmapped Tests ───────────────────────────────────────────────────────

function UnmappedTab({ onBadgeChange }: { onBadgeChange: (n: number) => void }) {
  const [items, setItems] = useState<UnmappedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [categories, setCategories] = useState<Category[]>([]);

  // Map-to-existing state
  const [mapTarget, setMapTarget] = useState<string | null>(null);
  const [mapSearch, setMapSearch] = useState("");
  const [mapResults, setMapResults] = useState<{ id: string; canonical_name: string; category: string }[]>([]);

  // Create new state
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCatId, setNewCatId] = useState("");
  const [newSyns, setNewSyns] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/pricing/unmapped?status=${filter}`);
    const data = await res.json();
    setItems(data.items ?? []);
    onBadgeChange(data.pending_count ?? 0);
    setLoading(false);
  }, [filter, onBadgeChange]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    fetch("/api/admin/pricing/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []));
  }, []);

  useEffect(() => {
    if (mapSearch.length < 2) { setMapResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(mapSearch)}&limit=8`);
      const data = await res.json();
      setMapResults(data.results ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [mapSearch]);

  async function doAction(id: string, action: "ignore" | "map" | "create", extra?: object) {
    setSaving(true);
    const res = await fetch("/api/admin/pricing/unmapped", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, ...extra }),
    });
    if (res.ok) {
      toast.success(action === "ignore" ? "Ignored" : "Resolved");
      setMapTarget(null); setCreateFor(null); setNewName(""); setNewCatId(""); setNewSyns(""); setMapSearch("");
      fetchItems();
    } else {
      const d = await res.json();
      toast.error(d.error ?? "Failed");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-white font-semibold flex-1">Unmapped Tests</h3>
        <div className="flex gap-1">
          {(["pending", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-lg capitalize ${filter === f ? "bg-medical-600 text-white" : "bg-slate-700 text-slate-400 hover:text-white"}`}>
              {f}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={fetchItems} loading={loading}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400 text-sm">No {filter === "pending" ? "pending" : ""} items.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-slate-700/50 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{item.raw_name}</p>
                  <p className="text-xs text-slate-500">
                    seen {item.occurrence_count}× · last {format(new Date(item.last_seen_at), "d MMM yyyy")}
                  </p>
                </div>
                {item.status !== "pending" && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${item.status === "resolved" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-600 text-slate-400"}`}>
                    {item.status}
                  </span>
                )}
                {item.status === "pending" && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setMapTarget(item.id); setCreateFor(null); }}
                      className="text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-2 py-1 rounded-lg">
                      Map
                    </button>
                    <button
                      onClick={() => { setCreateFor(item.id); setMapTarget(null); setNewName(item.raw_name); }}
                      className="text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 px-2 py-1 rounded-lg">
                      Create
                    </button>
                    <button
                      onClick={() => doAction(item.id, "ignore")}
                      className="text-xs bg-slate-600 text-slate-400 hover:bg-slate-500 px-2 py-1 rounded-lg">
                      Ignore
                    </button>
                  </div>
                )}
              </div>

              {/* Map to existing */}
              {mapTarget === item.id && (
                <div className="border-t border-slate-700 px-4 pb-3 pt-2 space-y-2">
                  <p className="text-xs text-slate-400 font-medium">Map to existing test</p>
                  <input
                    value={mapSearch} onChange={(e) => setMapSearch(e.target.value)}
                    placeholder="Search catalog..."
                    className="w-full bg-slate-600 border border-slate-500 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-medical-500"
                    autoFocus
                  />
                  {mapResults.map((r) => (
                    <button key={r.id}
                      onClick={() => doAction(item.id, "map", { catalog_test_id: r.id })}
                      disabled={saving}
                      className="w-full flex items-center justify-between text-sm bg-slate-600 hover:bg-slate-500 px-3 py-2 rounded-lg text-left">
                      <span className="text-white">{r.canonical_name}</span>
                      <span className="text-slate-400 text-xs">{r.category}</span>
                    </button>
                  ))}
                  <button onClick={() => setMapTarget(null)} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
                </div>
              )}

              {/* Create new */}
              {createFor === item.id && (
                <div className="border-t border-slate-700 px-4 pb-3 pt-2 space-y-2">
                  <p className="text-xs text-slate-400 font-medium">Create new test</p>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="Canonical name"
                    className="w-full bg-slate-600 border border-slate-500 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-medical-500" />
                  <select value={newCatId} onChange={(e) => setNewCatId(e.target.value)}
                    className="w-full bg-slate-600 border border-slate-500 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-medical-500">
                    <option value="">Select category...</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input value={newSyns} onChange={(e) => setNewSyns(e.target.value)}
                    placeholder="Extra synonyms (comma-separated)"
                    className="w-full bg-slate-600 border border-slate-500 text-white text-sm px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-medical-500" />
                  <div className="flex gap-2">
                    <Button size="sm" loading={saving} disabled={!newName.trim() || !newCatId}
                      onClick={() => doAction(item.id, "create", {
                        canonical_name: newName,
                        category_id: newCatId,
                        synonyms: newSyns.split(",").map((s) => s.trim()).filter(Boolean),
                      })}>
                      Create & Map
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCreateFor(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────

export function AdminPricing() {
  const [tab, setTab] = useState<PricingTab>("catalog");
  const [unmappedBadge, setUnmappedBadge] = useState(0);

  const tabs: { key: PricingTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "catalog", label: "Test Catalog", icon: <FlaskConical className="w-4 h-4" /> },
    { key: "overrides", label: "Lab Overrides", icon: <Building2 className="w-4 h-4" /> },
    { key: "unmapped", label: "Unmapped Queue", icon: <AlertCircle className="w-4 h-4" />, badge: unmappedBadge },
  ];

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <h1 className="text-xl font-bold text-white">Pricing Catalog</h1>
            <p className="text-sm text-slate-400">Manage test catalog, per-lab overrides, and resolve unmapped tests</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800 p-1 rounded-xl w-fit">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                tab === t.key ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              }`}>
              {t.icon}
              {t.label}
              {t.badge ? (
                <span className="ml-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {t.badge > 9 ? "9+" : t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-slate-800 rounded-2xl p-6 min-h-96">
          {tab === "catalog"   && <CatalogTab />}
          {tab === "overrides" && <OverridesTab />}
          {tab === "unmapped"  && <UnmappedTab onBadgeChange={setUnmappedBadge} />}
        </div>
      </div>
    </div>
  );
}
