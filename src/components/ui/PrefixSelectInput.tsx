"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

const PREFIXES = ["Dr.", "Prof.", "Nurse", "Pharm.", "Physio.", "Mr.", "Mrs.", "Ms."];

interface PrefixSelectInputProps {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

export function PrefixSelectInput({ value, onChange, disabled }: PrefixSelectInputProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 148) });
  }, []);

  useEffect(() => { if (open) updatePos(); }, [open, updatePos]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => { window.removeEventListener("scroll", updatePos, true); window.removeEventListener("resize", updatePos); };
  }, [open, updatePos]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const dropdown = mounted && open ? createPortal(
    <div style={{
      position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width,
      zIndex: 99999, background: "#ffffff", border: "1px solid #e2e8f0",
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)", borderRadius: "12px", overflow: "hidden",
    }}>
      {PREFIXES.map((p) => (
        <button
          key={p}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onChange(p); setOpen(false); }}
          className={`w-full text-left px-4 py-2.5 text-sm transition hover:bg-slate-50 ${value === p ? "font-semibold text-medical-700 bg-medical-50" : "text-slate-700"}`}
        >
          {p}
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        className="h-[44px] px-3 rounded-xl border border-slate-200 bg-white/60 backdrop-blur-sm text-sm flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 transition-all min-w-[80px] text-slate-700"
      >
        <span className={value ? "font-medium" : "text-slate-400"}>{value || "Title"}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {dropdown}
    </div>
  );
}
