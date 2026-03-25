"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";
import clsx from "clsx";

/* ─── Complete country / dial-code list ─────────────────────────────── */
export const COUNTRIES = [
  // Nigeria first (default)
  { code: "NG", name: "Nigeria",                    dial: "+234", flag: "🇳🇬" },
  // Rest of Africa
  { code: "DZ", name: "Algeria",                    dial: "+213", flag: "🇩🇿" },
  { code: "AO", name: "Angola",                     dial: "+244", flag: "🇦🇴" },
  { code: "BJ", name: "Benin",                      dial: "+229", flag: "🇧🇯" },
  { code: "BW", name: "Botswana",                   dial: "+267", flag: "🇧🇼" },
  { code: "BF", name: "Burkina Faso",               dial: "+226", flag: "🇧🇫" },
  { code: "BI", name: "Burundi",                    dial: "+257", flag: "🇧🇮" },
  { code: "CV", name: "Cabo Verde",                 dial: "+238", flag: "🇨🇻" },
  { code: "CM", name: "Cameroon",                   dial: "+237", flag: "🇨🇲" },
  { code: "CF", name: "Central African Republic",   dial: "+236", flag: "🇨🇫" },
  { code: "TD", name: "Chad",                       dial: "+235", flag: "🇹🇩" },
  { code: "KM", name: "Comoros",                    dial: "+269", flag: "🇰🇲" },
  { code: "CD", name: "Congo (DRC)",                dial: "+243", flag: "🇨🇩" },
  { code: "CG", name: "Congo (Republic)",           dial: "+242", flag: "🇨🇬" },
  { code: "CI", name: "Côte d'Ivoire",              dial: "+225", flag: "🇨🇮" },
  { code: "DJ", name: "Djibouti",                   dial: "+253", flag: "🇩🇯" },
  { code: "EG", name: "Egypt",                      dial: "+20",  flag: "🇪🇬" },
  { code: "GQ", name: "Equatorial Guinea",          dial: "+240", flag: "🇬🇶" },
  { code: "ER", name: "Eritrea",                    dial: "+291", flag: "🇪🇷" },
  { code: "SZ", name: "Eswatini",                   dial: "+268", flag: "🇸🇿" },
  { code: "ET", name: "Ethiopia",                   dial: "+251", flag: "🇪🇹" },
  { code: "GA", name: "Gabon",                      dial: "+241", flag: "🇬🇦" },
  { code: "GM", name: "Gambia",                     dial: "+220", flag: "🇬🇲" },
  { code: "GH", name: "Ghana",                      dial: "+233", flag: "🇬🇭" },
  { code: "GN", name: "Guinea",                     dial: "+224", flag: "🇬🇳" },
  { code: "GW", name: "Guinea-Bissau",              dial: "+245", flag: "🇬🇼" },
  { code: "KE", name: "Kenya",                      dial: "+254", flag: "🇰🇪" },
  { code: "LS", name: "Lesotho",                    dial: "+266", flag: "🇱🇸" },
  { code: "LR", name: "Liberia",                    dial: "+231", flag: "🇱🇷" },
  { code: "LY", name: "Libya",                      dial: "+218", flag: "🇱🇾" },
  { code: "MG", name: "Madagascar",                 dial: "+261", flag: "🇲🇬" },
  { code: "MW", name: "Malawi",                     dial: "+265", flag: "🇲🇼" },
  { code: "ML", name: "Mali",                       dial: "+223", flag: "🇲🇱" },
  { code: "MR", name: "Mauritania",                 dial: "+222", flag: "🇲🇷" },
  { code: "MU", name: "Mauritius",                  dial: "+230", flag: "🇲🇺" },
  { code: "MA", name: "Morocco",                    dial: "+212", flag: "🇲🇦" },
  { code: "MZ", name: "Mozambique",                 dial: "+258", flag: "🇲🇿" },
  { code: "NA", name: "Namibia",                    dial: "+264", flag: "🇳🇦" },
  { code: "NE", name: "Niger",                      dial: "+227", flag: "🇳🇪" },
  { code: "RW", name: "Rwanda",                     dial: "+250", flag: "🇷🇼" },
  { code: "ST", name: "São Tomé & Príncipe",        dial: "+239", flag: "🇸🇹" },
  { code: "SN", name: "Senegal",                    dial: "+221", flag: "🇸🇳" },
  { code: "SC", name: "Seychelles",                 dial: "+248", flag: "🇸🇨" },
  { code: "SL", name: "Sierra Leone",               dial: "+232", flag: "🇸🇱" },
  { code: "SO", name: "Somalia",                    dial: "+252", flag: "🇸🇴" },
  { code: "ZA", name: "South Africa",               dial: "+27",  flag: "🇿🇦" },
  { code: "SS", name: "South Sudan",                dial: "+211", flag: "🇸🇸" },
  { code: "SD", name: "Sudan",                      dial: "+249", flag: "🇸🇩" },
  { code: "TZ", name: "Tanzania",                   dial: "+255", flag: "🇹🇿" },
  { code: "TG", name: "Togo",                       dial: "+228", flag: "🇹🇬" },
  { code: "TN", name: "Tunisia",                    dial: "+216", flag: "🇹🇳" },
  { code: "UG", name: "Uganda",                     dial: "+256", flag: "🇺🇬" },
  { code: "ZM", name: "Zambia",                     dial: "+260", flag: "🇿🇲" },
  { code: "ZW", name: "Zimbabwe",                   dial: "+263", flag: "🇿🇼" },
  // Americas
  { code: "US", name: "United States",              dial: "+1",   flag: "🇺🇸" },
  { code: "CA", name: "Canada",                     dial: "+1",   flag: "🇨🇦" },
  { code: "MX", name: "Mexico",                     dial: "+52",  flag: "🇲🇽" },
  { code: "BR", name: "Brazil",                     dial: "+55",  flag: "🇧🇷" },
  { code: "AR", name: "Argentina",                  dial: "+54",  flag: "🇦🇷" },
  { code: "CO", name: "Colombia",                   dial: "+57",  flag: "🇨🇴" },
  { code: "CL", name: "Chile",                      dial: "+56",  flag: "🇨🇱" },
  { code: "PE", name: "Peru",                       dial: "+51",  flag: "🇵🇪" },
  { code: "VE", name: "Venezuela",                  dial: "+58",  flag: "🇻🇪" },
  { code: "JM", name: "Jamaica",                    dial: "+1",   flag: "🇯🇲" },
  { code: "TT", name: "Trinidad & Tobago",          dial: "+1",   flag: "🇹🇹" },
  // Europe
  { code: "GB", name: "United Kingdom",             dial: "+44",  flag: "🇬🇧" },
  { code: "DE", name: "Germany",                    dial: "+49",  flag: "🇩🇪" },
  { code: "FR", name: "France",                     dial: "+33",  flag: "🇫🇷" },
  { code: "IT", name: "Italy",                      dial: "+39",  flag: "🇮🇹" },
  { code: "ES", name: "Spain",                      dial: "+34",  flag: "🇪🇸" },
  { code: "PT", name: "Portugal",                   dial: "+351", flag: "🇵🇹" },
  { code: "NL", name: "Netherlands",                dial: "+31",  flag: "🇳🇱" },
  { code: "BE", name: "Belgium",                    dial: "+32",  flag: "🇧🇪" },
  { code: "CH", name: "Switzerland",                dial: "+41",  flag: "🇨🇭" },
  { code: "AT", name: "Austria",                    dial: "+43",  flag: "🇦🇹" },
  { code: "SE", name: "Sweden",                     dial: "+46",  flag: "🇸🇪" },
  { code: "NO", name: "Norway",                     dial: "+47",  flag: "🇳🇴" },
  { code: "DK", name: "Denmark",                    dial: "+45",  flag: "🇩🇰" },
  { code: "FI", name: "Finland",                    dial: "+358", flag: "🇫🇮" },
  { code: "PL", name: "Poland",                     dial: "+48",  flag: "🇵🇱" },
  { code: "CZ", name: "Czech Republic",             dial: "+420", flag: "🇨🇿" },
  { code: "HU", name: "Hungary",                    dial: "+36",  flag: "🇭🇺" },
  { code: "RO", name: "Romania",                    dial: "+40",  flag: "🇷🇴" },
  { code: "GR", name: "Greece",                     dial: "+30",  flag: "🇬🇷" },
  { code: "IE", name: "Ireland",                    dial: "+353", flag: "🇮🇪" },
  { code: "RU", name: "Russia",                     dial: "+7",   flag: "🇷🇺" },
  { code: "UA", name: "Ukraine",                    dial: "+380", flag: "🇺🇦" },
  { code: "TR", name: "Turkey",                     dial: "+90",  flag: "🇹🇷" },
  // Middle East
  { code: "AE", name: "UAE",                        dial: "+971", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia",               dial: "+966", flag: "🇸🇦" },
  { code: "QA", name: "Qatar",                      dial: "+974", flag: "🇶🇦" },
  { code: "KW", name: "Kuwait",                     dial: "+965", flag: "🇰🇼" },
  { code: "BH", name: "Bahrain",                    dial: "+973", flag: "🇧🇭" },
  { code: "OM", name: "Oman",                       dial: "+968", flag: "🇴🇲" },
  { code: "JO", name: "Jordan",                     dial: "+962", flag: "🇯🇴" },
  { code: "LB", name: "Lebanon",                    dial: "+961", flag: "🇱🇧" },
  { code: "IL", name: "Israel",                     dial: "+972", flag: "🇮🇱" },
  { code: "IQ", name: "Iraq",                       dial: "+964", flag: "🇮🇶" },
  { code: "IR", name: "Iran",                       dial: "+98",  flag: "🇮🇷" },
  // Asia
  { code: "IN", name: "India",                      dial: "+91",  flag: "🇮🇳" },
  { code: "PK", name: "Pakistan",                   dial: "+92",  flag: "🇵🇰" },
  { code: "BD", name: "Bangladesh",                 dial: "+880", flag: "🇧🇩" },
  { code: "CN", name: "China",                      dial: "+86",  flag: "🇨🇳" },
  { code: "JP", name: "Japan",                      dial: "+81",  flag: "🇯🇵" },
  { code: "KR", name: "South Korea",               dial: "+82",  flag: "🇰🇷" },
  { code: "SG", name: "Singapore",                  dial: "+65",  flag: "🇸🇬" },
  { code: "MY", name: "Malaysia",                   dial: "+60",  flag: "🇲🇾" },
  { code: "ID", name: "Indonesia",                  dial: "+62",  flag: "🇮🇩" },
  { code: "PH", name: "Philippines",                dial: "+63",  flag: "🇵🇭" },
  { code: "TH", name: "Thailand",                   dial: "+66",  flag: "🇹🇭" },
  { code: "VN", name: "Vietnam",                    dial: "+84",  flag: "🇻🇳" },
  { code: "LK", name: "Sri Lanka",                  dial: "+94",  flag: "🇱🇰" },
  { code: "NP", name: "Nepal",                      dial: "+977", flag: "🇳🇵" },
  // Oceania
  { code: "AU", name: "Australia",                  dial: "+61",  flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand",                dial: "+64",  flag: "🇳🇿" },
];

const DEFAULT_DIAL = "+234";

/* ─── Parse an existing stored phone string ──────────────────────────── */
function parsePhone(raw: string): { dialCode: string; number: string } {
  const v = (raw ?? "").trim();
  if (!v) return { dialCode: DEFAULT_DIAL, number: "" };

  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (v.startsWith(c.dial)) {
      return { dialCode: c.dial, number: v.slice(c.dial.length).trimStart() };
    }
  }

  if (v.startsWith("0")) return { dialCode: DEFAULT_DIAL, number: v.slice(1) };
  return { dialCode: DEFAULT_DIAL, number: v };
}

/* ─── Country picker modal (portal, bottom-sheet on mobile) ─────────── */
interface PickerModalProps {
  selected: typeof COUNTRIES[number];
  onSelect: (dial: string) => void;
  onClose: () => void;
}

function CountryPickerModal({ selected, onSelect, onClose }: PickerModalProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // Lock body scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.dial.includes(q) ||
          c.code.toLowerCase().includes(q)
      )
    : COUNTRIES;

  function handleSelect(dial: string) {
    onSelect(dial);
    onClose();
  }

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center"
      aria-modal="true"
      role="dialog"
      aria-label="Select country code"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative w-full sm:w-[420px] sm:mx-4 bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[600px] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Select Country</h2>
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
              placeholder="Search country or code…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "Enter" && filtered.length === 1) handleSelect(filtered[0].dial);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 placeholder-slate-400"
            />
          </div>
        </div>

        {/* Country list */}
        <ul ref={listRef} className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <li className="px-5 py-8 text-sm text-slate-400 text-center">No countries found</li>
          ) : (
            filtered.map((c) => {
              const isSelected = c.code === selected.code;
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c.dial)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left",
                      "active:bg-medical-50",
                      isSelected
                        ? "bg-medical-50 text-medical-700"
                        : "hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <span className="text-2xl leading-none w-8 text-center">{c.flag}</span>
                    <span className="flex-1 text-sm font-medium truncate">{c.name}</span>
                    <span className={clsx(
                      "text-sm tabular-nums font-semibold shrink-0",
                      isSelected ? "text-medical-600" : "text-slate-400"
                    )}>
                      {c.dial}
                    </span>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-medical-500 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Safe area bottom padding (iOS) */}
        <div className="sm:hidden h-safe-bottom" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

/* ─── Main PhoneInput component ──────────────────────────────────────── */
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
  const [mounted, setMounted] = useState(false);

  // Ensure portal only renders client-side
  useEffect(() => { setMounted(true); }, []);

  // Re-parse whenever parent changes the value (autofill, clear, reset, etc.)
  useEffect(() => {
    const { dialCode: d, number: n } = parsePhone(value);
    setDialCode(d);
    setNumber(n);
  }, [value]);

  function emit(dial: string, num: string) {
    const combined = num.trim() ? `${dial} ${num.trim()}` : "";
    onChange(combined);
  }

  function handleDialSelect(dial: string) {
    setDialCode(dial);
    emit(dial, number);
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d\s\-().]/g, "");
    setNumber(raw);
    emit(dialCode, raw);
  }

  const selected = COUNTRIES.find((c) => c.dial === dialCode && c.code !== "CA" && c.code !== "JM" && c.code !== "TT")
    ?? COUNTRIES.find((c) => c.dial === dialCode)
    ?? COUNTRIES[0];

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-medium text-slate-700">
          {label}
          {required && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
          )}
        </label>
      )}

      {/* Input row — no overflow-hidden, no relative positioning for dropdown */}
      <div className={clsx(
        "flex rounded-xl border bg-white/60 backdrop-blur-sm transition-all duration-200",
        "focus-within:ring-2 focus-within:ring-medical-500 focus-within:border-medical-400",
        error ? "border-red-400" : "border-slate-200 hover:border-slate-300"
      )}>
        {/* Dial code trigger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 rounded-l-xl transition-colors border-r border-slate-200 shrink-0"
          aria-label={`Country code ${selected.dial}, tap to change`}
        >
          <span className="text-base leading-none">{selected.flag}</span>
          <span className="text-xs font-semibold text-slate-600 tabular-nums">{selected.dial}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {/* Number field */}
        <input
          type="tel"
          placeholder="803 123 4567"
          value={number}
          onChange={handleNumberChange}
          className="flex-1 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none rounded-r-xl min-w-0"
        />
      </div>

      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {/* Portal modal — renders on document.body, no clipping ever */}
      {mounted && open && (
        <CountryPickerModal
          selected={selected}
          onSelect={handleDialSelect}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
