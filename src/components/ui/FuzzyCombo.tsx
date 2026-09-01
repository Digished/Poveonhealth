"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { fuzzyFilter } from "@/lib/nigeria-locations";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";

/**
 * Predictive picker for states / LGAs. The field is a trigger that opens a
 * portal-rendered popup (bottom sheet on mobile, centred dialog on desktop)
 * with fuzzy type-ahead — consistent with the phone country picker, and never
 * clipped behind buttons like an inline dropdown.
 */
export function FuzzyCombo({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  allowCustom,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  /** Lets the user keep what they typed when it isn't in the list. */
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTimeout(() => searchRef.current?.focus(), 80);
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const suggestions = fuzzyFilter(query, options, 50);
  // Offer "use what I typed" unless the query exactly matches a listed option.
  const customEntry =
    allowCustom && query.trim() && !options.some((o) => o.toLowerCase() === query.trim().toLowerCase())
      ? query.trim()
      : null;

  function pick(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  const modal = (
    <div className="fixed inset-0 z-[10050] flex flex-col sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={placeholder}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden="true" />
      {/* Mobile: top-anchored full-height panel so the search stays above the
          on-screen keyboard and the list scrolls beneath it. Desktop: centred dialog. */}
      <div className="relative flex h-full max-h-full w-full flex-col bg-white shadow-2xl sm:mx-4 sm:h-auto sm:max-h-[600px] sm:w-[420px] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-slate-800">{placeholder.replace(" *", "")}</h2>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (suggestions.length > 0) pick(suggestions[0]);
                  else if (customEntry) pick(customEntry);
                }
              }}
              placeholder="Type to search…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-500"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto overscroll-contain py-1">
          {customEntry && (
            <li>
              <button
                type="button"
                onClick={() => pick(customEntry)}
                className="flex w-full items-center gap-2 px-5 py-3 text-left text-sm text-medical-700 transition-colors hover:bg-medical-50 active:bg-medical-50"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">Use &ldquo;{customEntry}&rdquo;</span>
              </button>
            </li>
          )}
          {suggestions.length === 0 ? (
            !customEntry && <li className="px-5 py-8 text-center text-sm text-slate-400">No matches found</li>
          ) : (
            suggestions.map((o) => (
              <li key={o}>
                <button
                  type="button"
                  onClick={() => pick(o)}
                  className={`flex w-full items-center justify-between px-5 py-3 text-left text-sm transition-colors active:bg-medical-50 ${o === value ? "bg-medical-50 font-semibold text-medical-700" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  {o}
                  {o === value && <span className="h-2 w-2 shrink-0 rounded-full bg-medical-500" />}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={`${inputCls} flex items-center justify-between gap-2 text-left disabled:bg-slate-50 disabled:text-slate-400`}
      >
        <span className={`truncate ${value ? "text-slate-800" : "text-slate-400"}`}>{value || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {mounted && open && !disabled && createPortal(modal, document.body)}
    </>
  );
}
