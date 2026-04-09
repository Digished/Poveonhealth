"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { smartSplitTestNames } from "@/lib/smart-split";

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
  // Short all-consonant tokens → abbreviations (fbc, lft, eucr, pcv…)
  if (word.length <= 6 && !/[aeiou]/.test(word)) return false;
  // 4+ consecutive consonants → suspicious
  if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(word)) return true;
  // Fewer than 15% vowels in a 5+ char word → suspicious
  const vowels = (word.match(/[aeiou]/g) ?? []).length;
  if (word.length >= 5 && vowels / word.length < 0.15) return true;
  return false;
}

export function TestTagInput({ value, onChange, labId, error, label, disabled }: TestTagInputProps) {
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // ── Dropdown position (portal — bypasses overflow:hidden ancestors) ─────────
  const updateDropdownPos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => {
    if (open) updateDropdownPos();
  }, [open, updateDropdownPos]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updateDropdownPos, true);
    window.addEventListener("resize", updateDropdownPos);
    return () => {
      window.removeEventListener("scroll", updateDropdownPos, true);
      window.removeEventListener("resize", updateDropdownPos);
    };
  }, [open, updateDropdownPos]);

  // ── Debounced catalog search ───────────────────────────────────────────────
  useEffect(() => {
    const q = inputText.trim();
    if (q.length < 2) {
      setResults([]); setOpen(false); setSearching(false);
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
          setResults(r);
          setSearching(false);
          setOpen(r.length > 0);
          setActiveIdx(-1);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [inputText, labId]);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Tag actions ───────────────────────────────────────────────────────────
  function addCatalogTag(r: CatalogResult) {
    if (value.some((t) => t.name.toLowerCase() === r.canonical_name.toLowerCase())) {
      setInputText(""); setOpen(false); return;
    }
    onChange([...value, {
      name: r.canonical_name,
      catalog_test_id: r.id,
      price: r.effective_price,
      category: r.category,
      is_rapid_test: r.is_rapid_test,
      low_confidence: false,
    }]);
    setInputText(""); setResults([]); setOpen(false); setSearching(false); setActiveIdx(-1);
    inputRef.current?.focus();
  }

  function addFreeTextTag(raw: string) {
    const name = raw.trim();
    if (!name) return;
    if (value.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setInputText(""); return;
    }
    // Low confidence when: catalog had suggestions (user ignored them) OR name looks like a typo
    const low_confidence = results.length > 0 || looksLikeMisspelling(name);
    onChange([...value, { name, catalog_test_id: null, low_confidence }]);
    setInputText(""); setResults([]); setOpen(false); setSearching(false); setActiveIdx(-1);
    inputRef.current?.focus();
  }

  /**
   * Split input text intelligently and add each test as a separate tag.
   * Falls through to addFreeTextTag for single results (carries results context).
   */
  function addSplitTags(raw: string) {
    const names = smartSplitTestNames(raw);
    if (names.length === 0) return;
    if (names.length === 1) { addFreeTextTag(names[0]); return; }

    const newTags = names
      .filter((n) => !value.some((t) => t.name.toLowerCase() === n.toLowerCase()))
      .map((n) => ({
        name: n,
        catalog_test_id: null as string | null,
        low_confidence: looksLikeMisspelling(n),
      }));
    if (newTags.length > 0) onChange([...value, ...newTags]);
    setInputText(""); setResults([]); setOpen(false); setActiveIdx(-1);
    inputRef.current?.focus();
  }

  function removeTag(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  // ── Keyboard handler ──────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault(); e.stopPropagation();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      setActiveIdx((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false); setActiveIdx(-1);
      return;
    }
    if (e.key === "Backspace" && !inputText && value.length > 0) {
      removeTag(value.length - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (activeIdx >= 0 && results[activeIdx]) {
        addCatalogTag(results[activeIdx]);
      } else if (inputText.trim()) {
        addSplitTags(inputText);
      }
      return;
    }
    if (e.key === "Tab" && inputText.trim()) {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) {
        addCatalogTag(results[activeIdx]);
      } else {
        addSplitTags(inputText);
      }
    }
  }

  const catalogCount = value.filter((t) => t.catalog_test_id).length;

  // ── Dropdown portal ───────────────────────────────────────────────────────
  const showDropdown = mounted && (open || searching) && inputText.trim().length >= 2;
  const dropdown = showDropdown ? createPortal(
    <div
      style={{
        position: "fixed",
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 99999,
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {searching && (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
          <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3v4A12 12 0 014 12z"/>
          </svg>
          Searching catalog…
        </div>
      )}
      {!searching && results.map((r, i) => (
        <button
          key={r.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); addCatalogTag(r); }}
          style={{ background: activeIdx === i ? "#f0f9ff" : undefined }}
          className="w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50"
        >
          <div className="flex items-center gap-2 min-w-0">
            {r.is_rapid_test && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Rapid test" />
            )}
            <span className="font-medium text-slate-800 truncate">{r.canonical_name}</span>
            <span className="text-xs text-slate-400 flex-shrink-0 hidden sm:inline">{r.category}</span>
          </div>
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div
      className="flex flex-col gap-1.5"
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } }}
    >
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
        </label>
      )}

      <div ref={containerRef} className="relative">
        {/* Tag + input container */}
        <div
          onClick={() => !disabled && inputRef.current?.focus()}
          className={[
            "min-h-[72px] w-full rounded-xl border bg-white px-3 py-2.5",
            "flex flex-wrap gap-1.5 items-start cursor-text transition-all duration-200",
            error
              ? "border-red-400 ring-2 ring-red-400 bg-red-50/40"
              : "border-slate-200 hover:border-slate-300 focus-within:ring-2 focus-within:ring-medical-500 focus-within:border-medical-400 focus-within:bg-white",
          ].join(" ")}
        >
          {value.map((tag, i) => (
            <span
              key={i}
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
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Rapid test" />
              )}
              {tag.low_confidence && !tag.catalog_test_id && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Not matched in catalog" />
              )}
              {/* break-words so very long names wrap inside the pill */}
              <span className="break-words min-w-0">{tag.name}</span>
              {!disabled && (
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); removeTag(i); }}
                  className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}

          <div className="flex-1 min-w-[160px] flex items-center gap-1.5 relative">
            <input
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (results.length > 0) setOpen(true); }}
              disabled={disabled}
              data-no-enter-nav="true"
              enterKeyHint="done"
              placeholder={value.length === 0 ? "Type test name e.g. FBC, CRP, Chest Xray" : ""}
              className="flex-1 bg-transparent text-slate-800 text-sm placeholder-slate-400 outline-none py-0.5 my-0.5"
            />
            {inputText.trim().length > 0 && (
              <span className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-medical-50 border border-medical-200 pointer-events-none">
                <span className="text-xs font-semibold text-medical-700">Press</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-medical-300 rounded text-xs font-mono text-medical-700 shadow-sm">⏎</kbd>
                <span className="text-xs font-semibold text-medical-700">to add</span>
              </span>
            )}
          </div>
        </div>

        {dropdown}
      </div>

      {/* Summary row */}
      {value.length > 0 && (
        <div className="flex items-center justify-between text-xs px-0.5">
          <span className="text-slate-500">
            {value.length} test{value.length !== 1 ? "s" : ""}
            {catalogCount > 0 && catalogCount < value.length && (
              <span className="text-slate-400"> · {value.length - catalogCount} custom</span>
            )}
          </span>
        </div>
      )}

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      {!error && (
        <p className="text-xs text-slate-500">
          Tip: Type a test name and press{" "}
          <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono text-[10px]">Enter</kbd>
          {" "}or{" "}
          <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-mono text-[10px]">Tab</kbd>
          {" "}to add each test
        </p>
      )}
    </div>
  );
}
