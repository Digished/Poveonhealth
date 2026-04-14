"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Search, FlaskConical } from "lucide-react";
import { smartSplitTestNames } from "@/lib/smart-split";

// Module-level cache — persists for the session across modal opens
const _resultCache = new Map<string, CatalogResult[]>();

export type TestTag = {
  name: string;
  catalog_test_id: string | null;
  price?: number;
  category?: string;
  is_rapid_test?: boolean;
  low_confidence?: boolean;
};

type CatalogResult = {
  id: string;
  canonical_name: string;
  category: string;
  effective_price: number;
  is_rapid_test: boolean;
};

interface TestTagInputProps {
  value: TestTag[];
  onChange: (tags: TestTag[]) => void;
  labId?: string;
  error?: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Misspelling heuristic — a proxy for "this doesn't look like a real word".
 * Short tokens ≤6 chars with no vowels are treated as medical abbreviations
 * (FBC, LFT, fbc, eucr, pcv) and are never flagged, regardless of case.
 */
function looksLikeMisspelling(s: string): boolean {
  const word = s.trim().replace(/[\s\-\/()]/g, "").toLowerCase();
  if (word.length < 4) return false;
  if (word.length <= 6 && !/[aeiou]/.test(word)) return false;
  if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(word)) return true;
  const vowels = (word.match(/[aeiou]/g) ?? []).length;
  if (word.length >= 5 && vowels / word.length < 0.15) return true;
  return false;
}

// ─── Tag pill (shared between trigger and modal) ─────────────────────────────
function TagPill({ tag, onRemove }: { tag: TestTag; onRemove?: () => void }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium max-w-full",
        tag.catalog_test_id
          ? "bg-medical-100 text-medical-800 border border-medical-200"
          : tag.low_confidence
          ? "bg-amber-50 text-amber-800 border border-amber-300"
          : "bg-slate-100 text-slate-700 border border-slate-200",
      ].join(" ")}
      title={tag.low_confidence && !tag.catalog_test_id ? "Not found in lab catalog — will be sent as-is" : undefined}
    >
      {tag.is_rapid_test && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Rapid test" />
      )}
      {tag.low_confidence && !tag.catalog_test_id && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Not matched in catalog" />
      )}
      <span className="break-words min-w-0">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onRemove(); }}
          className="opacity-50 hover:opacity-100 transition-opacity shrink-0 ml-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

// ─── Search modal (bottom-sheet on mobile, centered dialog on desktop) ────────
function TestSearchModal({
  value,
  onChange,
  labId,
  onClose,
}: {
  value: TestTag[];
  onChange: (tags: TestTag[]) => void;
  labId?: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track keyboard height so the sheet floats above it on mobile
  const [sheetStyle, setSheetStyle] = useState<React.CSSProperties>({});

  // Auto-focus when modal opens
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Reposition sheet above the software keyboard using visualViewport API
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      // Only apply on mobile widths; desktop uses centered positioning
      if (window.innerWidth >= 640) {
        setSheetStyle({});
        return;
      }
      // keyboard offset = gap between bottom of visual viewport and bottom of layout viewport
      const keyboardH = Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop);
      setSheetStyle({
        bottom: keyboardH,
        maxHeight: `${vv!.height * 0.92}px`,
        // smooth transition as keyboard animates in/out
        transition: "bottom 0.22s ease, max-height 0.22s ease",
      });
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Debounced catalog search — skipped for comma-separated input, cached for repeats
  useEffect(() => {
    const q = query.trim();

    // Comma = user is entering a list — skip catalog entirely
    if (q.includes(",")) {
      setResults([]);
      setSearching(false);
      return;
    }

    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    // Serve from cache instantly if we've seen this query before
    const cacheKey = `${labId ?? ""}:${q.toLowerCase()}`;
    if (_resultCache.has(cacheKey)) {
      setResults(_resultCache.get(cacheKey)!);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const labParam = labId ? `&lab_id=${encodeURIComponent(labId)}` : "";
        const res = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(q)}${labParam}&limit=8`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          const r: CatalogResult[] = data.results ?? [];
          _resultCache.set(cacheKey, r);
          setResults(r);
          setSearching(false);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearching(false);
      }
    }, 100);
    return () => { clearTimeout(t); controller.abort(); };
  }, [query, labId]);

  // ── tag helpers ─────────────────────────────────────────────────────────────
  function addCatalogTag(r: CatalogResult) {
    if (value.some((t) => t.name.toLowerCase() === r.canonical_name.toLowerCase())) {
      setQuery(""); inputRef.current?.focus(); return;
    }
    onChange([...value, {
      name: r.canonical_name,
      catalog_test_id: r.id,
      price: r.effective_price,
      category: r.category,
      is_rapid_test: r.is_rapid_test,
      low_confidence: false,
    }]);
    setQuery("");
    inputRef.current?.focus();
  }

  function addFreeTextTag(raw: string) {
    const name = raw.trim();
    if (!name) return;
    if (value.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setQuery(""); return;
    }
    const low_confidence = results.length > 0 || looksLikeMisspelling(name);
    onChange([...value, { name, catalog_test_id: null, low_confidence }]);
    setQuery("");
    inputRef.current?.focus();
  }

  function addSplitTags(raw: string) {
    const names = smartSplitTestNames(raw);
    if (names.length === 0) return;
    if (names.length === 1) { addFreeTextTag(names[0]); return; }
    const newTags = names
      .filter((n) => !value.some((t) => t.name.toLowerCase() === n.toLowerCase()))
      .map((n) => ({ name: n, catalog_test_id: null as string | null, low_confidence: looksLikeMisspelling(n) }));
    if (newTags.length > 0) onChange([...value, ...newTags]);
    setQuery("");
    inputRef.current?.focus();
  }

  function removeTag(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      // Comma-separated list → add all immediately, no catalog needed
      if (query.includes(",")) { addSplitTags(query); return; }
      if (results[0] && query.trim()) { addCatalogTag(results[0]); return; }
      if (query.trim()) addSplitTags(query);
      return;
    }
    if (e.key === "Backspace" && !query && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  const hasComma = query.includes(",");
  const splitPreview = hasComma ? smartSplitTestNames(query) : [];
  const showMultiHint = hasComma && splitPreview.length >= 2;
  const showCustomHint = !hasComma && query.trim().length >= 2 && !searching && results.length === 0;
  const showEmpty = !searching && !hasComma && query.trim().length < 2 && value.length === 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-[99998] animate-backdrop-in"
        onClick={onClose}
      />

      {/* Sheet — slides up from bottom on mobile, centered on sm+ */}
      <div
        style={sheetStyle}
        className={[
          "fixed z-[99999] bg-white flex flex-col shadow-2xl",
          // Mobile: anchored to bottom, height constrained by visualViewport (via sheetStyle)
          "inset-x-0 bottom-0 rounded-t-2xl max-h-[92dvh]",
          // Desktop: centered using inset-0 + m-auto (avoids transform conflict with animation)
          "sm:inset-0 sm:m-auto sm:h-fit",
          "sm:w-full sm:max-w-md sm:rounded-2xl sm:max-h-[80vh]",
          "animate-sheet-up sm:animate-fade-in",
        ].join(" ")}
      >
        {/* Drag handle (mobile visual cue) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-sm font-semibold text-slate-700">Add Tests</p>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-medical-600 hover:text-medical-700 transition-colors px-1.5 py-1 rounded-lg"
          >
            Done
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 pt-3 pb-2.5 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200 focus-within:border-medical-400 focus-within:ring-2 focus-within:ring-medical-200 transition-all">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Type test name e.g. FBC, CRP, X-ray…"
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
            />
            {query.trim().length > 0 && (
              <button
                type="button"
                onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {searching && (
            <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1.5">
              <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3v4A12 12 0 014 12z" />
              </svg>
              Searching catalog…
            </p>
          )}
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Multi-test hint — shown when input has commas */}
          {showMultiHint && (
            <div className="px-4 py-4">
              <button
                type="button"
                onClick={() => addSplitTags(query)}
                className="w-full flex items-start gap-3 rounded-xl bg-medical-50 border border-medical-200 px-4 py-3.5 text-left hover:bg-medical-100 active:bg-medical-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-medical-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Plus className="w-4 h-4 text-medical-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-medical-700">
                    Add {splitPreview.length} tests at once
                  </p>
                  <p className="text-xs text-medical-500 mt-0.5 leading-relaxed">
                    {splitPreview.slice(0, 4).join(" · ")}{splitPreview.length > 4 ? ` · +${splitPreview.length - 4} more` : ""}
                  </p>
                  <p className="text-xs text-medical-400 mt-1.5">Tap or press Enter</p>
                </div>
              </button>
            </div>
          )}

          {/* Catalog matches */}
          {!hasComma && !searching && results.map((r) => {
            const already = value.some((t) => t.name.toLowerCase() === r.canonical_name.toLowerCase());
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => addCatalogTag(r)}
                className={[
                  "w-full flex items-center justify-between px-4 py-3.5 text-left",
                  "border-b border-slate-50 transition-colors",
                  already
                    ? "opacity-50 cursor-default"
                    : "hover:bg-slate-50 active:bg-slate-100",
                ].join(" ")}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {r.is_rapid_test && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Rapid test" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{r.canonical_name}</p>
                    <p className="text-xs text-slate-400 truncate">{r.category}</p>
                  </div>
                </div>
                {already ? (
                  <span className="text-xs text-emerald-600 font-semibold shrink-0 ml-3">Added</span>
                ) : (
                  <Plus className="w-4 h-4 text-medical-400 shrink-0 ml-3" />
                )}
              </button>
            );
          })}

          {/* Custom test hint — no catalog match */}
          {showCustomHint && (
            <button
              type="button"
              onClick={() => addSplitTags(query)}
              className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 active:bg-slate-100 border-b border-slate-50 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-slate-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">
                  Add &ldquo;<span className="text-medical-600">{query}</span>&rdquo; as custom test
                </p>
                <p className="text-xs text-slate-400">Not found in catalog — will be sent as-is</p>
              </div>
            </button>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="px-4 py-10 text-center text-slate-400">
              <FlaskConical className="w-9 h-9 mx-auto mb-2.5 opacity-30" />
              <p className="text-sm font-medium">Search the test catalog</p>
              <p className="text-xs mt-1">Type at least 2 characters</p>
            </div>
          )}
        </div>

        {/* Added tags footer */}
        {value.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 shrink-0 bg-slate-50/60">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Added — {value.length} test{value.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {value.map((tag, i) => (
                <TagPill key={i} tag={tag} onRemove={() => removeTag(i)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
export function TestTagInput({ value, onChange, labId, error, label, disabled }: TestTagInputProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const catalogCount = value.filter((t) => t.catalog_test_id).length;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
        </label>
      )}

      {/* Trigger — tapping opens the modal */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setModalOpen(true)}
        className={[
          "w-full text-left rounded-xl border px-3 py-3 transition-all min-h-[52px]",
          "flex flex-wrap gap-1.5 items-center",
          error
            ? "border-red-400 ring-2 ring-red-400 bg-red-50/40"
            : disabled
            ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
            : value.length > 0
            ? "border-medical-200 bg-medical-50/30 hover:border-medical-400"
            : "border-slate-200 bg-white hover:border-medical-400 hover:bg-medical-50/20",
        ].join(" ")}
      >
        {value.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-400">
            {disabled ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3v4A12 12 0 014 12z" />
                </svg>
                <span className="text-sm">Scanning for tests…</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span className="text-sm">Add laboratory tests…</span>
              </>
            )}
          </div>
        ) : (
          <>
            {value.map((tag, i) => (
              <TagPill key={i} tag={tag} />
            ))}
            {!disabled && (
              <span className="text-xs text-medical-400 font-medium ml-1">+ add more</span>
            )}
          </>
        )}
      </button>

      {/* Summary */}
      {value.length > 0 && (
        <div className="flex items-center justify-between text-xs px-0.5">
          <span className="text-slate-500">
            {value.length} test{value.length !== 1 ? "s" : ""}
            {catalogCount > 0 && catalogCount < value.length && (
              <span className="text-slate-400"> · {value.length - catalogCount} custom</span>
            )}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {/* Modal portal */}
      {mounted && modalOpen && createPortal(
        <TestSearchModal
          value={value}
          onChange={onChange}
          labId={labId}
          onClose={() => setModalOpen(false)}
        />,
        document.body
      )}
    </div>
  );
}
