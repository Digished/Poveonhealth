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

export function TestTagInput({ value, onChange, labId, error, label, disabled }: TestTagInputProps) {
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
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
    // re-position on scroll anywhere (including inside overflow containers)
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
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      const labParam = labId ? `&lab_id=${encodeURIComponent(labId)}` : "";
      const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}${labParam}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen((data.results ?? []).length > 0);
        setActiveIdx(-1);
      }
    }, 250);
    return () => clearTimeout(t);
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
    }]);
    setInputText(""); setResults([]); setOpen(false); setActiveIdx(-1);
    inputRef.current?.focus();
  }

  function addFreeTextTag(raw: string) {
    const name = raw.trim();
    if (!name) return;
    if (value.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setInputText(""); return;
    }
    onChange([...value, { name, catalog_test_id: null }]);
    setInputText(""); setResults([]); setOpen(false); setActiveIdx(-1);
    inputRef.current?.focus();
  }

  /**
   * Split input text intelligently (handles imaging prefixes + comma/and lists)
   * and add each resulting test as a separate tag.
   */
  function addSplitTags(raw: string) {
    const names = smartSplitTestNames(raw);
    if (names.length === 0) return;
    if (names.length === 1) { addFreeTextTag(names[0]); return; }

    const newTags = names
      .filter((n) => !value.some((t) => t.name.toLowerCase() === n.toLowerCase()))
      .map((n) => ({ name: n, catalog_test_id: null as string | null }));
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
      e.stopPropagation(); // prevent parent glass-card from advancing to next field
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
  const dropdown = open && results.length > 0 && mounted ? createPortal(
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
      {results.map((r, i) => (
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
      {inputText.trim() && (
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); addFreeTextTag(inputText); }}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-50 border-t border-slate-100 transition-colors"
        >
          <span>Add &ldquo;<span className="font-medium text-slate-700">{inputText.trim()}</span>&rdquo; as custom test</span>
        </button>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
        </label>
      )}

      <div ref={containerRef} className="relative">
        {/* Tag container */}
        <div
          onClick={() => !disabled && inputRef.current?.focus()}
          className={[
            "min-h-[72px] w-full rounded-xl border bg-white/60 backdrop-blur-sm px-3 py-2.5",
            "flex flex-wrap gap-1.5 items-start cursor-text transition-all duration-200",
            error
              ? "border-red-400 ring-2 ring-red-400"
              : "border-slate-200 hover:border-slate-300 focus-within:ring-2 focus-within:ring-medical-500 focus-within:border-medical-400",
          ].join(" ")}
        >
          {value.map((tag, i) => (
            <span
              key={i}
              className={[
                "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 max-w-full",
                tag.catalog_test_id
                  ? "bg-medical-100 text-medical-800 border border-medical-200"
                  : "bg-slate-100 text-slate-700 border border-slate-200",
              ].join(" ")}
            >
              {tag.is_rapid_test && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Rapid test" />
              )}
              <span className="truncate">{tag.name}</span>
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

          <input
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            disabled={disabled}
            placeholder={value.length === 0 ? "Type a test name — select from suggestions or press Enter to add" : ""}
            className="flex-1 min-w-[160px] bg-transparent text-slate-800 text-sm placeholder-slate-400 outline-none py-0.5 my-0.5"
          />
        </div>

        {/* Dropdown rendered via portal to escape overflow:hidden ancestors */}
        {dropdown}
      </div>

      {/* Summary row */}
      {value.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
          <span>
            {value.length} test{value.length !== 1 ? "s" : ""}
            {catalogCount > 0 && catalogCount < value.length && (
              <span className="text-slate-400"> · {value.length - catalogCount} custom</span>
            )}
          </span>
        </div>
      )}

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
      {!error && value.length === 0 && (
        <p className="text-xs text-slate-400">
          Start typing to search the test catalog, or press{" "}
          <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-mono text-[10px]">Enter</kbd>
          {" "}to add any test
        </p>
      )}
    </div>
  );
}
