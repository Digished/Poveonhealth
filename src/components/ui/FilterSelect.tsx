"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface FilterOption { value: string; label: string; count?: number }

/**
 * Compact, modern dropdown for filters — a trigger button that opens a popover
 * list. Closes on outside-click. No external deps; styled for the dark dashboard.
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label?: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
      >
        <span className="truncate">
          {label && <span className="text-slate-500">{label}: </span>}
          <span className="font-medium text-white">{current?.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full min-w-[12rem] overflow-y-auto rounded-xl border border-white/10 bg-slate-800 p-1 shadow-2xl">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${o.value === value ? "bg-medical-600/25 text-white" : "text-slate-200 hover:bg-white/10"}`}
            >
              <span className="truncate">{o.label}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {o.count != null && <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-slate-300">{o.count}</span>}
                {o.value === value && <Check className="h-3.5 w-3.5 text-medical-300" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
