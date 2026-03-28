"use client";

/**
 * LabPriceListManager
 * ─────────────────────────────────────────────────────────────────────────────
 * A full-screen overlay that lets lab users view, inline-edit, and download
 * their price list.  Opens when the "Manage Price List" button is clicked.
 *
 * Features
 * ────────
 * • Excel-like table with sticky header & first column
 * • Inline price editing (click → number input → Enter / blur to save)
 * • Category rename (dropdown from existing categories + free-type)
 * • Active / Inactive toggle per test
 * • Price-change indicators: ↑ green / ↓ red / ★ new test
 * • "Changed by" column showing who last modified each test
 * • Full change history side-panel (per test or all)
 * • Download as CSV or Excel
 * • Search, category filter, active/all filter, sortable columns
 * • Mobile-friendly: horizontal scroll + sticky test-name column
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, Search, Download, RefreshCw, ArrowUpRight, ArrowDownRight,
  History, ChevronDown, ChevronUp, ChevronsUpDown, ToggleLeft,
  ToggleRight, FileSpreadsheet, FileText, Check, AlertCircle,
  Sparkles, Clock, User, Filter, ChevronRight,
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriceArrow({ direction }: { direction: "up" | "down" | "same" | null }) {
  if (!direction || direction === "same") return null;
  if (direction === "up") {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-400 font-bold text-xs ml-1.5">
        <ArrowUpRight className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-rose-400 font-bold text-xs ml-1.5">
      <ArrowDownRight className="w-3 h-3" />
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    owner: "bg-violet-500/20 text-violet-300",
    member: "bg-sky-500/20 text-sky-300",
    admin: "bg-amber-500/20 text-amber-300",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${map[role] ?? "bg-white/10 text-slate-300"}`}>
      {role}
    </span>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  testId,
  testName,
  onClose,
}: {
  testId: string | null; // null = show all recent changes
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
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <History className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">Change History</p>
          {testName && <p className="text-xs text-slate-500 truncate">{testName}</p>}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        )}
        {!loading && history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 px-4 py-12">
            <History className="w-8 h-8 opacity-40" />
            <p className="text-sm text-center">No changes recorded yet.</p>
          </div>
        )}
        {!loading && history.length > 0 && (
          <div className="divide-y divide-white/5">
            {history.map((h) => (
              <div key={h.id} className="px-4 py-3 hover:bg-white/3 transition-colors">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 shrink-0">
                    {h.field_changed === "lab_price" && h.old_price != null && h.new_price != null ? (
                      Number(h.new_price) > Number(h.old_price) ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-rose-500/15 flex items-center justify-center">
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                        </div>
                      )
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-sky-500/15 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 font-medium">
                      {fieldLabel(h.field_changed)} changed
                    </p>
                    {h.field_changed === "lab_price" && h.old_price != null && h.new_price != null ? (
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="line-through text-rose-400/70">{fmt(h.old_price)}</span>
                        {" → "}
                        <span className="text-emerald-400">{fmt(h.new_price)}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="opacity-60">{h.old_value ?? "—"}</span>
                        {" → "}
                        <span className="text-white">{h.new_value ?? "—"}</span>
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <RoleBadge role={h.changed_by_role} />
                      <p className="text-[10px] text-slate-500 truncate">{h.changed_by}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 shrink-0 mt-0.5">{timeAgo(h.changed_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inline Price Cell ─────────────────────────────────────────────────────────

function PriceCell({
  value,
  testId,
  testName,
  isActive,
  onSave,
}: {
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

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commit() {
    const parsed = parseFloat(draft);
    if (isNaN(parsed) || parsed < 0) {
      setDraft(String(value));
      setEditing(false);
      return;
    }
    if (parsed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(testId, parsed);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-slate-400 text-sm">₦</span>
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
          className="w-28 px-2 py-1 rounded-lg bg-sky-500/15 border border-sky-400/40 text-white text-sm font-mono focus:outline-none focus:border-sky-400"
        />
        {saving && <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />}
      </div>
    );
  }

  return (
    <button
      disabled={!isActive}
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      title={isActive ? `Click to edit price for ${testName}` : "Activate test to edit price"}
      className={`group flex items-center gap-1 px-2 py-1 rounded-lg transition-all text-left w-full
        ${isActive
          ? "hover:bg-sky-500/10 hover:ring-1 hover:ring-sky-400/30 cursor-text"
          : "opacity-50 cursor-not-allowed"
        }`}
    >
      <span className="text-sm font-mono text-white font-medium">{fmt(value)}</span>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface LabPriceListManagerProps {
  onClose: () => void;
}

export default function LabPriceListManager({ onClose }: LabPriceListManagerProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [tests, setTests] = useState<PriceListTest[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters + sort
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("active");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // History panel
  const [historyTestId, setHistoryTestId] = useState<string | null>(null);
  const [historyTestName, setHistoryTestName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  // Inline save flash state: testId → "saved" | "error"
  const [flashState, setFlashState] = useState<Record<string, "saved" | "error">>({});

  // Download dropdown
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);

  // Cat filter dropdown
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    fetch("/api/lab/price-list")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setTests(d.tests);
          setCategories(d.categories ?? []);
        }
      })
      .catch(() => toast.error("Failed to load price list"))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dlRef.current && !dlRef.current.contains(e.target as Node)) setDlOpen(false);
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ── Save price change ──────────────────────────────────────────────────────
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
      setTests((prev) =>
        prev.map((t) =>
          t.id === testId
            ? {
                ...t,
                lab_price: data.test.lab_price,
                poveon_fee: data.test.poveon_fee,
                updated_at: data.test.updated_at,
                recent_change: {
                  field_changed: "lab_price",
                  old_price: t.lab_price,
                  new_price: data.test.lab_price,
                  old_value: null,
                  new_value: null,
                  changed_by: "you",
                  changed_by_role: "owner",
                  changed_at: data.test.updated_at,
                  direction: data.test.lab_price > t.lab_price ? "up" : data.test.lab_price < t.lab_price ? "down" : "same",
                },
              }
            : t
        )
      );
      setFlashState((s) => ({ ...s, [testId]: "saved" }));
      setTimeout(() => setFlashState((s) => { const n = { ...s }; delete n[testId]; return n; }), 2500);
      toast.success(`Price updated`);
    }
  }

  // ── Toggle active status ───────────────────────────────────────────────────
  async function toggleActive(testId: string, current: boolean) {
    const optimistic = !current;
    setTests((prev) => prev.map((t) => t.id === testId ? { ...t, is_active: optimistic } : t));
    const res = await fetch(`/api/lab/price-list/${testId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: optimistic }),
    });
    if (!res.ok) {
      setTests((prev) => prev.map((t) => t.id === testId ? { ...t, is_active: current } : t));
      toast.error("Could not update status");
    } else {
      toast.success(optimistic ? "Test activated" : "Test deactivated");
    }
  }

  // ── Sort handler ──────────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-sky-400" /> : <ChevronDown className="w-3 h-3 text-sky-400" />;
  }

  // ── Filtered + sorted tests ────────────────────────────────────────────────
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

  // ── Download ───────────────────────────────────────────────────────────────
  function download(format: "csv" | "xlsx") {
    setDlOpen(false);
    window.location.href = `/api/lab/price-list/export?format=${format}`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-slate-950 overflow-hidden"
      style={{ fontFamily: "inherit" }}
    >
      {/* ─────────────────── TOP BAR ───────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 bg-slate-900/80 backdrop-blur border-b border-white/10">
        {/* Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-white leading-none">Price List Manager</h1>
            <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">
              {activeCount} active · {tests.length} total
            </p>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Download */}
        <div ref={dlRef} className="relative">
          <button
            onClick={() => setDlOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-sm font-medium transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {dlOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-10">
              <button
                onClick={() => download("xlsx")}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-200 hover:bg-white/8 transition"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Excel (.xlsx)
              </button>
              <button
                onClick={() => download("csv")}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-slate-200 hover:bg-white/8 transition"
              >
                <FileText className="w-4 h-4 text-sky-400" />
                CSV (.csv)
              </button>
            </div>
          )}
        </div>

        {/* History toggle */}
        <button
          onClick={() => {
            setHistoryTestId(null);
            setHistoryTestName("All changes");
            setHistoryOpen((o) => !o);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition
            ${historyOpen
              ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
              : "bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
            }`}
        >
          <History className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">History</span>
        </button>

        {/* Refresh */}
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          title="Refresh"
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* ─────────────────── FILTER BAR ────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2.5 bg-slate-900/40 border-b border-white/8">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests…"
            className="pl-8 pr-3 py-1.5 w-full rounded-lg bg-white/6 border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-white/25"
          />
        </div>

        {/* Category filter */}
        <div ref={catRef} className="relative">
          <button
            onClick={() => setCatOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/6 border border-white/10 text-sm text-slate-300 hover:text-white transition min-w-[120px]"
          >
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="flex-1 text-left truncate max-w-[100px]">{catFilter === "all" ? "All categories" : catFilter}</span>
            <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
          </button>
          {catOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-52 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-10 max-h-60 overflow-y-auto">
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  onClick={() => { setCatFilter(c); setCatOpen(false); }}
                  className={`flex items-center justify-between w-full px-3.5 py-2 text-sm transition
                    ${catFilter === c ? "bg-sky-500/15 text-sky-300" : "text-slate-300 hover:bg-white/8"}`}
                >
                  {c === "all" ? "All categories" : c}
                  {catFilter === c && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active filter */}
        <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
          {(["all", "active", "inactive"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setActiveFilter(v)}
              className={`px-2.5 py-1.5 font-medium capitalize transition
                ${activeFilter === v
                  ? "bg-sky-500/20 text-sky-300"
                  : "bg-white/4 text-slate-400 hover:text-white hover:bg-white/10"
                }`}
            >
              {v}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500 ml-auto hidden sm:block">
          {visible.length} of {tests.length} tests
        </p>
      </div>

      {/* ─────────────────── MAIN CONTENT ──────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Table area ── */}
        <div className={`flex-1 overflow-auto ${historyOpen ? "hidden sm:block" : ""}`}>
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500 py-16 px-6">
              <FileSpreadsheet className="w-12 h-12 opacity-30" />
              <div className="text-center">
                <p className="font-medium text-slate-400">No tests found</p>
                <p className="text-sm mt-1">
                  {search || catFilter !== "all" || activeFilter !== "all"
                    ? "Try adjusting your filters."
                    : "Upload a catalog via the admin panel to get started."}
                </p>
              </div>
            </div>
          ) : (
            <div className="min-w-[640px]">
              {/* ── Column headers (sticky) ── */}
              <div className="sticky top-0 z-10 grid bg-slate-900/95 backdrop-blur border-b border-white/10"
                style={{ gridTemplateColumns: "2fr 1.2fr 1.1fr 1.1fr 1fr 1fr 1.4fr" }}>
                {[
                  { label: "Test Name", key: "name" as SortKey },
                  { label: "Category", key: "category" as SortKey },
                  { label: "Your Price", key: "price" as SortKey },
                  { label: "Poveon Fee", key: null },
                  { label: "Commission", key: null },
                  { label: "Status", key: null },
                  { label: "Last Changed", key: "updated" as SortKey },
                ].map(({ label, key }) => (
                  <button
                    key={label}
                    disabled={!key}
                    onClick={() => key && handleSort(key)}
                    className={`flex items-center gap-1 px-3 py-3 text-[11px] uppercase tracking-wider font-semibold text-left
                      ${key ? "text-slate-400 hover:text-white transition cursor-pointer" : "text-slate-500 cursor-default"}`}
                  >
                    {label}
                    {key && <SortIcon col={key} />}
                  </button>
                ))}
              </div>

              {/* ── Rows ── */}
              <div>
                {visible.map((test, idx) => {
                  const flash = flashState[test.id];
                  const hasChange = !!test.recent_change;
                  const dir = test.recent_change?.direction;
                  const isNew = !hasChange && new Date(test.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;

                  return (
                    <div
                      key={test.id}
                      className={`grid border-b border-white/5 transition-all group
                        ${idx % 2 === 0 ? "bg-white/[0.02]" : ""}
                        ${!test.is_active ? "opacity-60" : ""}
                        ${flash === "saved" ? "bg-emerald-500/8" : ""}
                        ${flash === "error" ? "bg-rose-500/8" : ""}
                        hover:bg-white/[0.05]`}
                      style={{ gridTemplateColumns: "2fr 1.2fr 1.1fr 1.1fr 1fr 1fr 1.4fr" }}
                    >
                      {/* Test name */}
                      <div className="px-3 py-3 flex items-center gap-2 min-w-0">
                        {isNew && (
                          <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400" title="New test" />
                        )}
                        {dir === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        {dir === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                        <span className="text-sm text-slate-200 truncate font-medium">{test.raw_name}</span>
                      </div>

                      {/* Category */}
                      <div className="px-3 py-3 flex items-center">
                        <span className="text-xs text-slate-400 truncate">
                          {test.category_label ?? <span className="italic text-slate-600">—</span>}
                        </span>
                      </div>

                      {/* Price (editable) */}
                      <div className="px-1 py-2 flex items-center">
                        <PriceCell
                          value={test.lab_price}
                          testId={test.id}
                          testName={test.raw_name}
                          isActive={test.is_active}
                          onSave={savePrice}
                        />
                        {flash === "saved" && <Check className="w-3 h-3 text-emerald-400 ml-1 shrink-0" />}
                        {flash === "error" && <AlertCircle className="w-3 h-3 text-rose-400 ml-1 shrink-0" />}
                      </div>

                      {/* Poveon fee */}
                      <div className="px-3 py-3 flex items-center">
                        <span className="text-sm font-mono text-amber-300">
                          {test.poveon_fee != null ? fmt(test.poveon_fee) : <span className="text-slate-600 text-xs">—</span>}
                        </span>
                      </div>

                      {/* Commission % */}
                      <div className="px-3 py-3 flex items-center">
                        <span className="text-xs text-slate-400">
                          {test.commission_pct != null ? `${Number(test.commission_pct).toFixed(1)}%` : <span className="text-slate-600">—</span>}
                        </span>
                      </div>

                      {/* Active toggle */}
                      <div className="px-3 py-3 flex items-center">
                        <button
                          onClick={() => toggleActive(test.id, test.is_active)}
                          title={test.is_active ? "Deactivate" : "Activate"}
                          className="transition hover:scale-110"
                        >
                          {test.is_active
                            ? <ToggleRight className="w-6 h-6 text-emerald-400" />
                            : <ToggleLeft className="w-6 h-6 text-slate-600" />
                          }
                        </button>
                      </div>

                      {/* Last changed */}
                      <div className="px-3 py-3 flex items-center gap-1.5 min-w-0">
                        {hasChange ? (
                          <button
                            onClick={() => {
                              setHistoryTestId(test.id);
                              setHistoryTestName(test.raw_name);
                              setHistoryOpen(true);
                            }}
                            className="flex items-center gap-1.5 min-w-0 hover:text-sky-300 transition group/hist"
                          >
                            <div className="min-w-0">
                              <p className="text-[11px] text-slate-400 group-hover/hist:text-sky-300 truncate">
                                {test.recent_change!.changed_by === "you" ? "you" : test.recent_change!.changed_by.split("@")[0]}
                              </p>
                              <p className="text-[10px] text-slate-600">{timeAgo(test.recent_change!.changed_at)}</p>
                            </div>
                            <ChevronRight className="w-3 h-3 text-slate-600 group-hover/hist:text-sky-400 shrink-0 opacity-0 group-hover:opacity-100 transition" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600 italic">No changes yet</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom padding */}
              <div className="h-20" />
            </div>
          )}
        </div>

        {/* ── History panel (slide-in on sm+; full-screen on mobile) ── */}
        {historyOpen && (
          <div className={`
            border-l border-white/10 bg-slate-900/80 backdrop-blur overflow-hidden flex flex-col
            ${historyOpen ? "w-full sm:w-80" : "w-0"}
            transition-all duration-200
          `}>
            <HistoryPanel
              testId={historyTestId}
              testName={historyTestName}
              onClose={() => setHistoryOpen(false)}
            />
          </div>
        )}
      </div>

      {/* ─────────────────── FOOTER ────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-2 bg-slate-900/60 border-t border-white/8 text-[11px] text-slate-600">
        <span>Click a price to edit · Toggle to activate/deactivate · Click "Last Changed" to view history</span>
        <span className="hidden sm:inline">{visible.length} test{visible.length !== 1 ? "s" : ""} shown</span>
      </footer>
    </div>
  );
}
