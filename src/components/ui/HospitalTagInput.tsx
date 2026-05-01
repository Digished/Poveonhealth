"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Building2, X } from "lucide-react";

interface HospitalOption {
  id: string;
  name: string;
  city: string | null;
}

interface HospitalTagInputProps {
  value: string[];             // list of hospital name strings
  onChange: (names: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  max?: number;               // max number of hospitals; default 3
}

export function HospitalTagInput({
  value, onChange, placeholder = "Search hospital / clinic…", disabled, max = 3,
}: HospitalTagInputProps) {
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState<HospitalOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const updatePos = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useEffect(() => { if (open) updatePos(); }, [open, updatePos]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => { window.removeEventListener("scroll", updatePos, true); window.removeEventListener("resize", updatePos); };
  }, [open, updatePos]);

  // Debounced search
  useEffect(() => {
    const q = inputText.trim();
    if (q.length < 1) { setResults([]); setOpen(false); setSearching(false); return; }
    setSearching(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/hospitals?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setResults(data.hospitals ?? []);
          setSearching(false);
          setOpen(true);
          setActiveIdx(-1);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [inputText]);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function addHospital(name: string) {
    const n = name.trim();
    if (!n || value.includes(n)) { setInputText(""); setOpen(false); return; }
    onChange([...value, n]);
    setInputText(""); setResults([]); setOpen(false); setActiveIdx(-1);
    inputRef.current?.focus();
  }

  function removeHospital(name: string) {
    onChange(value.filter((h) => h !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); return; }
    if (e.key === "Escape") { setOpen(false); setActiveIdx(-1); return; }
    if (e.key === "Backspace" && !inputText && value.length > 0) {
      removeHospital(value[value.length - 1]); return;
    }
    if (e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      if (activeIdx >= 0 && results[activeIdx]) addHospital(results[activeIdx].name);
      else if (results.length === 1) addHospital(results[0].name);
      else if (inputText.trim()) addHospital(inputText.trim());
      return;
    }
  }

  const canAdd = !disabled && value.length < max;
  const showDropdown = mounted && (open || searching) && inputText.trim().length >= 1;

  const dropdown = showDropdown ? createPortal(
    <div style={{
      position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width,
      zIndex: 99999, background: "#ffffff", border: "1px solid #e2e8f0",
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)", borderRadius: "12px", overflow: "hidden",
    }}>
      {searching && (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-400">
          <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V0a12 12 0 100 24v-4l-3 3 3 3v4A12 12 0 014 12z"/>
          </svg>
          Searching…
        </div>
      )}
      {!searching && results.length === 0 && inputText.trim().length >= 2 && (
        <>
          <div className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-400 border-b border-slate-100">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            Not in our list — add it manually:
          </div>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); addHospital(inputText.trim()); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition"
          >
            <Building2 className="w-4 h-4 text-medical-500 shrink-0" />
            <span className="text-slate-700">Add <strong>&ldquo;{inputText.trim()}&rdquo;</strong></span>
          </button>
        </>
      )}
      {!searching && results.map((r, i) => (
        <button
          key={r.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); addHospital(r.name); }}
          style={{ background: activeIdx === i ? "#f0f9ff" : undefined }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition"
        >
          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          <div>
            <p className="font-medium text-slate-800">{r.name}</p>
            {r.city && <p className="text-xs text-slate-400">{r.city}</p>}
          </div>
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={containerRef} className="relative">
        <div
          onClick={() => canAdd && inputRef.current?.focus()}
          className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm px-3 py-2 flex flex-wrap gap-1.5 items-center cursor-text focus-within:ring-2 focus-within:ring-medical-500 focus-within:border-medical-400 transition-all"
        >
          {value.map((name) => (
            <span key={name} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-medical-50 text-medical-800 border border-medical-200">
              <Building2 className="w-3 h-3 shrink-0 opacity-60" />
              {name}
              {!disabled && (
                <button type="button" onMouseDown={(e) => { e.preventDefault(); removeHospital(name); }} className="opacity-50 hover:opacity-100 transition-opacity ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}

          {canAdd && (
            <input
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (results.length > 0) setOpen(true); }}
              disabled={disabled}
              placeholder={value.length === 0 ? placeholder : "Add another…"}
              className="flex-1 min-w-[160px] bg-transparent text-slate-800 text-sm placeholder-slate-400 outline-none py-0.5"
            />
          )}
        </div>
        {dropdown}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-slate-400">Search for a hospital or type a name and press Enter to add it</p>
      )}
    </div>
  );
}
