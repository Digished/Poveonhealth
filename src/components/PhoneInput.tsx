"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search } from "lucide-react";
import clsx from "clsx";

/* ─── Country list ───────────────────────────────────────────────────── */
export const COUNTRIES = [
  { code: "NG", name: "Nigeria",      dial: "+234", flag: "🇳🇬" },
  { code: "GH", name: "Ghana",        dial: "+233", flag: "🇬🇭" },
  { code: "KE", name: "Kenya",        dial: "+254", flag: "🇰🇪" },
  { code: "ZA", name: "South Africa", dial: "+27",  flag: "🇿🇦" },
  { code: "ET", name: "Ethiopia",     dial: "+251", flag: "🇪🇹" },
  { code: "CM", name: "Cameroon",     dial: "+237", flag: "🇨🇲" },
  { code: "UG", name: "Uganda",       dial: "+256", flag: "🇺🇬" },
  { code: "TZ", name: "Tanzania",     dial: "+255", flag: "🇹🇿" },
  { code: "RW", name: "Rwanda",       dial: "+250", flag: "🇷🇼" },
  { code: "SN", name: "Senegal",      dial: "+221", flag: "🇸🇳" },
  { code: "CI", name: "Côte d'Ivoire",dial: "+225", flag: "🇨🇮" },
  { code: "GB", name: "UK",           dial: "+44",  flag: "🇬🇧" },
  { code: "US", name: "USA / Canada", dial: "+1",   flag: "🇺🇸" },
  { code: "AE", name: "UAE",          dial: "+971", flag: "🇦🇪" },
  { code: "FR", name: "France",       dial: "+33",  flag: "🇫🇷" },
  { code: "DE", name: "Germany",      dial: "+49",  flag: "🇩🇪" },
  { code: "IN", name: "India",        dial: "+91",  flag: "🇮🇳" },
  { code: "AU", name: "Australia",    dial: "+61",  flag: "🇦🇺" },
];

const DEFAULT_DIAL = "+234";

/* ─── Parse an existing stored phone string ──────────────────────────── */
function parsePhone(raw: string): { dialCode: string; number: string } {
  const v = (raw ?? "").trim();
  if (!v) return { dialCode: DEFAULT_DIAL, number: "" };

  // Match known dial codes — longest first so "+234" beats "+23"
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (v.startsWith(c.dial)) {
      return { dialCode: c.dial, number: v.slice(c.dial.length).trimStart() };
    }
  }

  // Nigerian local format: leading 0 → strip it, use +234
  if (v.startsWith("0")) {
    return { dialCode: DEFAULT_DIAL, number: v.slice(1) };
  }

  // Unrecognised prefix — keep as-is under +234
  return { dialCode: DEFAULT_DIAL, number: v };
}

/* ─── Component ──────────────────────────────────────────────────────── */
interface PhoneInputProps {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (combined: string) => void;
  error?: string;
  hint?: string;
}

export function PhoneInput({ label, required, value, onChange, error, hint }: PhoneInputProps) {
  const { dialCode: initDial, number: initNumber } = parsePhone(value);
  const [dialCode, setDialCode] = useState(initDial);
  const [number, setNumber] = useState(initNumber);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-parse if parent resets value to empty (e.g. form reset)
  useEffect(() => {
    if (!value) {
      setDialCode(DEFAULT_DIAL);
      setNumber("");
    }
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function emit(dial: string, num: string) {
    const combined = num.trim() ? `${dial} ${num.trim()}` : "";
    onChange(combined);
  }

  function handleDialSelect(dial: string) {
    setDialCode(dial);
    setOpen(false);
    setQuery("");
    emit(dial, number);
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Strip any leading + or dial code the user might type manually
    let raw = e.target.value.replace(/[^\d\s\-().]/g, "");
    setNumber(raw);
    emit(dialCode, raw);
  }

  const selected = COUNTRIES.find((c) => c.dial === dialCode) ?? COUNTRIES[0];
  const filtered = query.trim()
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.dial.includes(query)
      )
    : COUNTRIES;

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
          )}
        </label>
      )}

      <div className={clsx(
        "flex rounded-xl border bg-white/60 backdrop-blur-sm overflow-hidden transition-all duration-200",
        "focus-within:ring-2 focus-within:ring-medical-500 focus-within:border-medical-400",
        error ? "border-red-400" : "border-slate-200 hover:border-slate-300"
      )}>
        {/* Dial code picker */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors border-r border-slate-200 h-full"
          >
            <span className="text-base leading-none">{selected.flag}</span>
            <span className="text-xs font-semibold text-slate-600 tabular-nums">{selected.dial}</span>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="absolute z-30 top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              {/* Search */}
              <div className="p-2 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search country…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-medical-400"
                  />
                </div>
              </div>
              <ul className="max-h-48 overflow-y-auto">
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-xs text-slate-400 text-center">No match</li>
                ) : (
                  filtered.map((c) => (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => handleDialSelect(c.dial)}
                        className={clsx(
                          "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-medical-50 transition-colors text-left",
                          c.dial === dialCode && "bg-medical-50"
                        )}
                      >
                        <span className="text-base">{c.flag}</span>
                        <span className="flex-1 text-xs text-slate-700 truncate">{c.name}</span>
                        <span className="text-xs text-slate-400 tabular-nums shrink-0">{c.dial}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Number input */}
        <input
          type="tel"
          placeholder="803 123 4567"
          value={number}
          onChange={handleNumberChange}
          className="flex-1 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none min-w-0"
        />
      </div>

      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
    </div>
  );
}
