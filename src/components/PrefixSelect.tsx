"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X, Check, ChevronDown, Pencil } from "lucide-react";

export const PROFESSIONAL_PREFIXES = [
  { value: "Dr.", label: "Dr. — Medical Doctor / Dentist" },
  { value: "Prof.", label: "Prof. — Professor / Specialist" },
  { value: "Nurse", label: "Nurse — Registered Nurse" },
  { value: "Pharm.", label: "Pharm. — Pharmacist" },
  { value: "CHEW", label: "CHEW — Community Health Extension Worker" },
  { value: "CHO", label: "CHO — Community Health Officer" },
  { value: "PT", label: "PT — Physiotherapist" },
  { value: "OT", label: "OT — Occupational Therapist" },
  { value: "Optom.", label: "Optom. — Optometrist" },
  { value: "MW", label: "MW — Midwife" },
  { value: "HO", label: "HO — House Officer" },
  { value: "MO", label: "MO — Medical Officer" },
  { value: "RN", label: "RN — Registered Nurse" },
  { value: "DVM", label: "DVM — Veterinarian" },
];

export function PrefixSelectModal({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  // Keep sheet above the on-screen keyboard on iOS/Android
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function sync() {
      if (!containerRef.current) return;
      containerRef.current.style.height = `${vv!.height}px`;
      containerRef.current.style.top = `${vv!.offsetTop}px`;
    }
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? PROFESSIONAL_PREFIXES.filter(
        (p) =>
          p.value.toLowerCase().includes(q) ||
          p.label.toLowerCase().includes(q)
      )
    : PROFESSIONAL_PREFIXES;

  function select(v: string) {
    onChange(v);
    onClose();
  }

  const modal = (
    <div
      ref={containerRef}
      className="fixed inset-x-0 top-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center"
      style={{ height: "100dvh" }}
      aria-modal="true"
      role="dialog"
      aria-label="Select title or prefix"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative w-full sm:w-[440px] sm:mx-4 bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90%] sm:max-h-[540px] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Handle (mobile only) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Title / Prefix</h2>
            <p className="text-xs text-slate-400 mt-0.5">Select your professional title</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by title or role…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "Enter" && filtered.length === 1) select(filtered[0].value);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 placeholder-slate-400"
            />
          </div>
        </div>

        {/* Option grid */}
        <div className="overflow-y-auto overscroll-contain p-4">
          {filtered.length === 0 ? (
            <p className="py-8 text-sm text-slate-400 text-center">No match found</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filtered.map((p) => {
                const isSelected = p.value === value;
                const desc = p.label.split(" — ")[1] ?? "";
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => select(p.value)}
                    className={`flex flex-col items-start px-4 py-3.5 rounded-xl border-2 text-left transition-all active:scale-[0.97] ${
                      isSelected
                        ? "border-medical-400 bg-medical-50"
                        : "border-slate-200 hover:border-medical-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className={`text-base font-bold leading-tight ${isSelected ? "text-medical-700" : "text-slate-800"}`}>
                      {p.value}
                    </span>
                    <span className={`text-xs mt-1 leading-tight ${isSelected ? "text-medical-500" : "text-slate-400"}`}>
                      {desc}
                    </span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-medical-500 mt-1.5 self-end" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* iOS safe area */}
        <div className="sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export function PrefixSelect({
  value,
  onChange,
  label = "Title / Prefix",
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = PROFESSIONAL_PREFIXES.find((p) => p.value === value);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5 align-middle" aria-label="required" />
          )}
        </label>
      )}

      {selected ? (
        <div className="w-full rounded-xl border border-medical-300 bg-medical-50 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-medical-800">{selected.value}</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="p-1.5 rounded-lg hover:bg-medical-100 text-medical-400 hover:text-medical-700 transition-colors"
              aria-label="Change title"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="p-1.5 rounded-lg hover:bg-medical-100 text-medical-400 hover:text-medical-700 transition-colors"
              aria-label="Clear title"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-2.5 flex items-center justify-between gap-2 hover:border-medical-300 hover:bg-medical-50/30 transition-colors"
        >
          <span className="text-sm text-slate-400">Select title or prefix (Dr., Nurse…)</span>
          <ChevronDown className="w-4 h-4 text-slate-300 shrink-0" />
        </button>
      )}

      {open && (
        <PrefixSelectModal
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
