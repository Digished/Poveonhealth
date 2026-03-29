"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Search, Download, RefreshCw, ArrowUpRight, ArrowDownRight,
  History, ChevronDown, ChevronUp, ChevronsUpDown,
  FileSpreadsheet, FileText, Check, AlertCircle,
  Sparkles, Filter, ChevronRight,
} from "lucide-react";
import { toast } from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentChange {
  field_changed: string;
  old_price: number | null;
  new_price: number | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_by_role: string;
  changed_at: string;
  direction: "up" | "down" | "same" | null;
}

export interface PriceListTest {
  id: string;
  raw_name: string;
  category_label: string | null;
  lab_price: number;
  poveon_fee: number | null;
  commission_pct: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  recent_change: RecentChange | null;
}

interface HistoryEntry {
  id: string;
  field_changed: string;
  old_price: number | null;
  new_price: number | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_by_role: string;
  changed_at: string;
}

type SortKey = "name" | "category" | "price" | "updated";
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function fieldLabel(field: string) {
  if (field === "lab_price") return "Price";
  if (field === "is_active") return "Status";
  if (field === "category_label") return "Category";
  return field;
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    owner: "bg-violet-100 text-violet-700 ring-1 ring-violet-200",
    member: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
    admin: "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${map[role] ?? "bg-gray-100 text-gray-600"}`}>
      {role}
    </span>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({ testId, testName, onClose }: {
  testId: string | null;
  testName: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!testId) return;
    setLoading(true);
    fetch(`/api/lab/price-list/${testId}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setHistory(d.history); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [testId]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <History className="w-4 h-4 text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Change History</p>
          {testName && <p className="text-xs text-gray-500 truncate mt-0.5">{testName}</p>}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}
        {!loading && history.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 text-gray-400 px-5 py-16">
            <History className="w-10 h-10 opacity-30" />
            <p className="text-sm text-center text-gray-500">No changes recorded yet.</p>
            <p className="text-xs text-center text-gray-400">Edit a price to start tracking changes.</p>
          </div>
        )}
        {!loading && history.length > 0 && (
          <div className="divide-y divide-gray-100">
            {history.map((h) => (
              <div key={h.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {h.field_changed === "lab_price" && h.old_price != null && h.new_price != null ? (
                      Number(h.new_price) > Number(h.old_price) ? (
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                          <ArrowDownRight className="w-3.5 h-3.5 text-red-600" />
                        </div>
                      )
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">
                      {fieldLabel(h.field_changed)} changed
                    </p>
                    {h.field_changed === "lab_price" && h.old_price != null && h.new_price != null ? (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="line-through text-red-400">{fmt(h.old_price)}</span>
                        <span className="mx-1.5 text-gray-300">→</span>
                        <span className="font-semibold text-emerald-600">{fmt(h.new_price)}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="text-gray-400">{h.old_value ?? "—"}</span>
                        <span className="mx-1.5 text-gray-300">→</span>
                        <span className="font-medium text-gray-700">{h.new_value ?? "—"}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <RoleBadge role={h.changed_by_role} />
                      <p className="text-[11px] text-gray-400 truncate">{h.changed_by}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 shrink-0 mt-0.5 whitespace-nowrap">{timeAgo(h.changed_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inline Price Cell ────────────────────────────────────────────────────────

function PriceCell({ value, testId, testName, isActive, onSave }: {
  value: number;
  testId: string;
  testName: string;
  isActive: boolean;
  onSave: (testId: string, newPrice: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit() {
    const parsed = parseFloat(draft);
    if (isNaN(parsed) || parsed < 0) { setDraft(String(value)); setEditing(false); return; }
    if (parsed === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(testId, parsed); }
    finally { setSaving(false); setEditing(false); }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-gray-400 text-sm font-medium">₦</span>
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(String(value)); setEditing(false); }
          }}
          className="w-28 px-2.5 py-1.5 rounded-lg bg-white border-2 border-blue-400 text-gray-900 text-sm font-mono focus:outline-none shadow-sm"
        />
        {saving && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />}
      </div>
    );
  }

  return (
    <button
      disabled={!isActive}
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      title={isActive ? `Click to edit price for ${testName}` : "Activate test to edit price"}
      className={`group flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all text-left w-full
        ${isActive
          ? "hover:bg-blue-50 hover:ring-2 hover:ring-blue-200 cursor-text"
          : "opacity-40 cursor-not-allowed"
        }`}
    >
      <span className="text-sm font-mono font-semibold text-gray-800">{fmt(value)}</span>
    </button>
  );
}

// ─── Active Toggle ────────────────────────────────────────────────────────────

function ActiveToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={active ? "Deactivate test" : "Activate test"}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1
        ${active ? "bg-emerald-500" : "bg-gray-300"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
        ${active ? "translate-x-[18px]" : "translate-x-[3px]"}`}
      />
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface LabPriceListManagerProps {
  onClose: () => void;
}

export default function LabPriceListManager({ onClose }: LabPriceListManagerProps) {
  const [tests, setTests] = useState<PriceListTest[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [historyTestId, setHistoryTestId] = useState<string | null>(null);
  const [historyTestName, setHistoryTestName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const [flashState, setFlashState] = useState<Record<string, "saved" | "error">>({});

  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  const loadData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    fetch("/api/lab/price-list")
      .then((r) => r.json())
      .then((d) => { if (d.success) { setTests(d.tests); setCategories(d.categories ?? []); } })
      .catch(() => toast.error("Failed to load price list"))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dlRef.current && !dlRef.current.contains(e.target as Node)) setDlOpen(false);
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ── Save price ─────────────────────────────────────────────────────────────
  async function savePrice(testId: string, newPrice: number) {
    const res = await fetch(`/api/lab/price-list/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lab_price: newPrice }),
    });
    if (!res.ok) {
      toast.error("Could not save price change");
      setFlashState((s) => ({ ...s, [testId]: "error" }));
      setTimeout(() => setFlashState((s) => { const n = { ...s }; delete n[testId]; return n; }), 2500);
      throw new Error("save failed");
    }
    const data = await res.json();
    if (data.success) {
      setTests((prev) => prev.map((t) => t.id === testId ? {
        ...t,
        lab_price: data.test.lab_price,
        poveon_fee: data.test.poveon_fee,
        updated_at: data.test.updated_at,
        recent_change: {
          field_changed: "lab_price",
          old_price: t.lab_price,
          new_price: data.test.lab_price,
          old_value: null, new_value: null,
          changed_by: "you", changed_by_role: "owner",
          changed_at: data.test.updated_at,
          direction: data.test.lab_price > t.lab_price ? "up" : data.test.lab_price < t.lab_price ? "down" : "same",
        },
      } : t));
      setFlashState((s) => ({ ...s, [testId]: "saved" }));
      setTimeout(() => setFlashState((s) => { const n = { ...s }; delete n[testId]; return n; }), 2500);
      toast.success("Price updated");
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────────
  async function toggleActive(testId: string, current: boolean) {
    setTests((prev) => prev.map((t) => t.id === testId ? { ...t, is_active: !current } : t));
    const res = await fetch(`/api/lab/price-list/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    if (!res.ok) {
      setTests((prev) => prev.map((t) => t.id === testId ? { ...t, is_active: current } : t));
      toast.error("Could not update status");
    } else {
      toast.success(!current ? "Test activated" : "Test deactivated");
    }
  }

  // ── Sort ───────────────────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-gray-300" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-blue-500" />
      : <ChevronDown className="w-3 h-3 text-blue-500" />;
  }

  // ── Filtered + sorted ──────────────────────────────────────────────────────
  const visible = tests
    .filter((t) => {
      const q = search.trim().toLowerCase();
      if (q && !t.raw_name.toLowerCase().includes(q) && !(t.category_label ?? "").toLowerCase().includes(q)) return false;
      if (catFilter !== "all" && t.category_label !== catFilter) return false;
      if (activeFilter === "active" && !t.is_active) return false;
      if (activeFilter === "inactive" && t.is_active) return false;
      return true;
    })
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return mul * a.raw_name.localeCompare(b.raw_name);
      if (sortKey === "category") return mul * (a.category_label ?? "").localeCompare(b.category_label ?? "");
      if (sortKey === "price") return mul * (a.lab_price - b.lab_price);
      if (sortKey === "updated") return mul * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
      return 0;
    });

  const activeCount = tests.filter((t) => t.is_active).length;

  function download(format: "csv" | "xlsx") {
    setDlOpen(false);
    window.location.href = `/api/lab/price-list/export?format=${format}`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-50" style={{ fontFamily: "inherit" }}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
      <header className="relative z-50 shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3.5 bg-white border-b border-gray-200 shadow-sm">
        {/* Icon + title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-sm">
            <FileSpreadsheet className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 leading-tight">Price List Manager</h1>
            <p className="text-xs text-gray-500 hidden sm:block">
              {activeCount} active · {tests.length} total tests
            </p>
          </div>
        </div>

        <div className="flex-1" />

        {/* History button */}
        <button
          onClick={() => { setHistoryTestId(null); setHistoryTestName("All changes"); setHistoryOpen((o) => !o); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition
            ${historyOpen
              ? "bg-violet-600 border-violet-600 text-white shadow-sm"
              : "bg-white border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800"
            }`}
        >
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">History</span>
        </button>

        {/* Download */}
        <div ref={dlRef} className="relative">
          <button
            onClick={() => setDlOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Download</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {dlOpen && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-[200]">
              <button onClick={() => download("xlsx")}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                Excel (.xlsx)
              </button>
              <div className="border-t border-gray-100" />
              <button onClick={() => download("csv")}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition">
                <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                CSV (.csv)
              </button>
            </div>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="p-2 rounded-lg bg-white border border-gray-300 text-gray-500 hover:text-gray-800 hover:border-gray-400 transition disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-white border border-gray-300 text-gray-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* ── FILTER BAR ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 bg-white border-b border-gray-200">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests…"
            className="pl-9 pr-4 py-2 w-full rounded-lg bg-gray-50 border border-gray-300 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
          />
        </div>

        {/* Category filter */}
        <div ref={catRef} className="relative">
          <button
            onClick={() => setCatOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-300 text-sm text-gray-700 hover:border-gray-400 transition min-w-[140px]"
          >
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="flex-1 text-left truncate max-w-[100px]">
              {catFilter === "all" ? "All categories" : catFilter}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          </button>
          {catOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-56 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-20 max-h-64 overflow-y-auto">
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  onClick={() => { setCatFilter(c); setCatOpen(false); }}
                  className={`flex items-center justify-between w-full px-4 py-2.5 text-sm transition
                    ${catFilter === c ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  {c === "all" ? "All categories" : c}
                  {catFilter === c && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active filter pills */}
        <div className="flex rounded-lg overflow-hidden border border-gray-300 text-sm">
          {(["all", "active", "inactive"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActiveFilter(v)}
              className={`px-3 py-2 font-medium capitalize transition
                ${activeFilter === v
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
            >
              {v}
            </button>
          ))}
        </div>

        <p className="text-sm text-gray-400 ml-auto hidden sm:block">
          {visible.length} of {tests.length} tests
        </p>
      </div>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Table area */}
        <div className={`flex-1 overflow-auto ${historyOpen ? "hidden sm:block" : ""}`}>
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-14 bg-gray-200 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-20 px-6">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                <FileSpreadsheet className="w-7 h-7 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-600">No tests found</p>
                <p className="text-sm mt-1 text-gray-400">
                  {search || catFilter !== "all" || activeFilter !== "all"
                    ? "Try adjusting your filters."
                    : "Upload a catalog via the admin panel to get started."}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-w-[640px]">
              {/* Column headers */}
              <div
                className="sticky top-0 z-10 grid bg-gray-100 border-b border-gray-300"
                style={{ gridTemplateColumns: "2fr 1.2fr 1.1fr 1.1fr 0.8fr 0.8fr 1.4fr" }}
              >
                {([
                  { label: "Test Name",    col: "name"     as SortKey },
                  { label: "Category",     col: "category" as SortKey },
                  { label: "Your Price",   col: "price"    as SortKey },
                  { label: "Poveon Fee",   col: null },
                  { label: "Comm %",       col: null },
                  { label: "Active",       col: null },
                  { label: "Last Changed", col: "updated"  as SortKey },
                ] as { label: string; col: SortKey | null }[]).map(({ label, col }) => (
                  <button
                    key={label}
                    disabled={!col}
                    onClick={() => col && handleSort(col)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-xs uppercase tracking-wide font-semibold text-left
                      ${col ? "text-gray-500 hover:text-gray-800 cursor-pointer transition" : "text-gray-400 cursor-default"}`}
                  >
                    {label}
                    {col && <SortIcon col={col} />}
                  </button>
                ))}
              </div>

              {/* Rows */}
              <div>
                {visible.map((test, idx) => {
                  const flash = flashState[test.id];
                  const dir = test.recent_change?.direction;
                  const isNew = !test.recent_change && new Date(test.created_at).getTime() > Date.now() - 7 * 86_400_000;

                  return (
                    <div
                      key={test.id}
                      className={`grid border-b border-gray-100 transition-colors group
                        ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}
                        ${!test.is_active ? "opacity-50" : ""}
                        ${flash === "saved" ? "!bg-emerald-50" : ""}
                        ${flash === "error" ? "!bg-red-50" : ""}
                        hover:bg-blue-50/40`}
                      style={{ gridTemplateColumns: "2fr 1.2fr 1.1fr 1.1fr 0.8fr 0.8fr 1.4fr" }}
                    >
                      {/* Test name */}
                      <div className="px-4 py-3.5 flex items-center gap-2 min-w-0">
                        {isNew && <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" title="New" />}
                        {dir === "up" && <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />}
                        {dir === "down" && <ArrowDownRight className="w-4 h-4 text-red-500 shrink-0" />}
                        <span className="text-sm font-medium text-gray-900 truncate">{test.raw_name}</span>
                      </div>

                      {/* Category */}
                      <div className="px-4 py-3.5 flex items-center">
                        {test.category_label
                          ? <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 truncate max-w-full">{test.category_label}</span>
                          : <span className="text-xs text-gray-300 italic">—</span>
                        }
                      </div>

                      {/* Price */}
                      <div className="px-2 py-2.5 flex items-center">
                        <PriceCell
                          value={test.lab_price}
                          testId={test.id}
                          testName={test.raw_name}
                          isActive={test.is_active}
                          onSave={savePrice}
                        />
                        {flash === "saved" && <Check className="w-3.5 h-3.5 text-emerald-500 ml-1 shrink-0" />}
                        {flash === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-500 ml-1 shrink-0" />}
                      </div>

                      {/* Poveon fee */}
                      <div className="px-4 py-3.5 flex items-center">
                        <span className="text-sm font-mono font-medium text-amber-600">
                          {test.poveon_fee != null ? fmt(test.poveon_fee) : <span className="text-gray-300 text-xs not-italic">—</span>}
                        </span>
                      </div>

                      {/* Commission % */}
                      <div className="px-4 py-3.5 flex items-center">
                        <span className="text-sm text-gray-500">
                          {test.commission_pct != null
                            ? `${Number(test.commission_pct).toFixed(1)}%`
                            : <span className="text-gray-300">—</span>
                          }
                        </span>
                      </div>

                      {/* Active toggle */}
                      <div className="px-4 py-3.5 flex items-center">
                        <ActiveToggle
                          active={test.is_active}
                          onToggle={() => toggleActive(test.id, test.is_active)}
                        />
                      </div>

                      {/* Last changed */}
                      <div className="px-4 py-3.5 flex items-center gap-2 min-w-0">
                        {test.recent_change ? (
                          <button
                            onClick={() => {
                              setHistoryTestId(test.id);
                              setHistoryTestName(test.raw_name);
                              setHistoryOpen(true);
                            }}
                            className="flex items-center gap-1.5 min-w-0 text-left group/hist hover:text-blue-600 transition"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-600 group-hover/hist:text-blue-600 truncate">
                                {test.recent_change.changed_by === "you"
                                  ? "you"
                                  : test.recent_change.changed_by.split("@")[0]}
                              </p>
                              <p className="text-[11px] text-gray-400">{timeAgo(test.recent_change.changed_at)}</p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover/hist:text-blue-500 shrink-0 opacity-0 group-hover:opacity-100 transition" />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300 italic">No changes yet</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="h-16" />
            </div>
          )}
        </div>

        {/* History panel */}
        {historyOpen && (
          <div className="w-full sm:w-80 shrink-0 border-l border-gray-200 overflow-hidden flex flex-col shadow-lg">
            <HistoryPanel
              testId={historyTestId}
              testName={historyTestName}
              onClose={() => setHistoryOpen(false)}
            />
          </div>
        )}
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white border-t border-gray-200 text-xs text-gray-400">
        <span>Click a price to edit · Toggle to activate/deactivate · Click "Last Changed" to view history</span>
        <span className="hidden sm:inline font-medium text-gray-500">{visible.length} test{visible.length !== 1 ? "s" : ""}</span>
      </footer>
    </div>
  );
}
