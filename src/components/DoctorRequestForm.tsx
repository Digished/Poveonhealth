"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  FlaskConical, User, MapPin, Phone, Stethoscope,
  TestTube2, ChevronRight, ChevronLeft, Building2, Check,
  Search, X, PhoneCall, RefreshCw, ChevronDown, Mail,
  Award, Info, Layers, CalendarDays, Clock, Pencil,
} from "lucide-react";

function MarsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="10" cy="14" r="5" />
      <line x1="14.5" y1="9.5" x2="21" y2="3" />
      <polyline points="16 3 21 3 21 8" />
    </svg>
  );
}

function VenusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="9" r="5" />
      <line x1="12" y1="14" x2="12" y2="21" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  );
}
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { PhoneInput } from "@/components/PhoneInput";
import { BankAccountInput } from "@/components/BankAccountInput";
import { DobInput } from "@/components/DobInput";
import { SuccessScreen } from "@/components/SuccessScreen";
import type { Lab, CreateRequestResponse } from "@/lib/types";

interface FormData {
  lab_id: string;
  patient_name: string;
  dob: string;
  sex: string;
  patient_email: string;
  address: string;
  patient_phone: string;
  doctor_prefix: string;
  doctor_name: string;
  doctor_email: string;
  doctor_phone: string;
  doctor_hospital: string;
  doctor_bank_name: string;
  doctor_account_number: string;
  doctor_account_name: string;
  schedule: string;
  diagnosis: string;
  tests: string;
}

const INITIAL: FormData = {
  lab_id: "",
  patient_name: "",
  dob: "",
  sex: "",
  patient_email: "",
  address: "",
  patient_phone: "",
  doctor_prefix: "",
  doctor_name: "",
  doctor_email: "",
  doctor_phone: "",
  doctor_hospital: "",
  doctor_bank_name: "",
  doctor_account_number: "",
  doctor_account_name: "",
  schedule: "",
  diagnosis: "",
  tests: "",
};

const PROFESSIONAL_PREFIXES = [
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

function PrefixSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

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

  const filtered = query.trim()
    ? PROFESSIONAL_PREFIXES.filter((p) =>
        p.value.toLowerCase().includes(query.toLowerCase()) ||
        p.label.toLowerCase().includes(query.toLowerCase())
      )
    : PROFESSIONAL_PREFIXES;

  const selected = PROFESSIONAL_PREFIXES.find((p) => p.value === value);

  function select(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    onChange("");
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        Title / Prefix <span className="text-xs text-slate-400 font-normal">(optional)</span>
      </label>
      <div className="relative">
        {selected ? (
          <div className="w-full rounded-xl border border-medical-300 bg-medical-50 px-4 py-2.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-medical-800">{selected.value}</span>
            <button
              type="button"
              onClick={clear}
              className="p-0.5 rounded hover:bg-medical-100 text-medical-400 hover:text-medical-700 shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search title (Dr., Nurse, Pharm., CHEW…)"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pl-10 text-slate-800 placeholder-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
            />
          </div>
        )}
        {open && !selected && (
          <div className="absolute z-20 top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-auto max-h-52">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400 text-center">No match</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => select(p.value)}
                  className="w-full text-left px-4 py-2.5 hover:bg-medical-50 transition-colors border-b border-slate-50 last:border-0"
                >
                  <span className="text-sm font-semibold text-slate-800">{p.value}</span>
                  <span className="text-xs text-slate-400 ml-2">{p.label.split("—")[1]?.trim()}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const STEPS = [
  { title: "Laboratory", icon: Building2 },
  { title: "Patient", icon: User },
  { title: "Referrer", icon: Stethoscope },
  { title: "Schedule", icon: CalendarDays },
  { title: "Tests", icon: TestTube2 },
];

const SCHEDULE_OPTIONS = [
  { value: "today", label: "Today", desc: "Run the test today", icon: Clock },
  { value: "this_week", label: "Within a week", desc: "Next 7 days", icon: CalendarDays },
  { value: "this_month", label: "Within a month", desc: "Next 30 days", icon: CalendarDays },
  { value: "not_sure", label: "Not sure yet", desc: "Haven't decided", icon: CalendarDays },
] as const;

function scheduleLabel(value: string | null): string {
  return SCHEDULE_OPTIONS.find((o) => o.value === value)?.label ?? "—";
}

const DOCTOR_STORAGE_KEY = "poveon_doctor_profile";

function SummaryRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex justify-between text-xs gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`text-slate-700 font-medium text-right ${capitalize ? "capitalize" : ""}`}>{value || "—"}</span>
    </div>
  );
}

// Lab search modal — portal-based, bottom sheet on mobile / centered on desktop
function LabSearchModal({
  labs,
  loading,
  selected,
  onSelect,
  onClose,
  onRefresh,
}: {
  labs: Lab[];
  loading: boolean;
  selected: Lab | undefined;
  onSelect: (lab: Lab) => void;
  onClose: () => void;
  onRefresh?: () => void;
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

  // Keep container height in sync with the visual viewport so the bottom sheet
  // stays above the on-screen keyboard on iOS/Android.
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
    ? labs.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.address.toLowerCase().includes(q) ||
          ((l.service_categories as string[] | null) ?? []).some((s) => s.toLowerCase().includes(q))
      )
    : labs;

  function handleSelect(lab: Lab) {
    onSelect(lab);
    onClose();
  }

  const modal = (
    <div
      ref={containerRef}
      className="fixed inset-x-0 top-0 z-[9999] flex flex-col justify-end sm:justify-center sm:items-center"
      style={{ height: "100dvh" }}
      aria-modal="true"
      role="dialog"
      aria-label="Select laboratory"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative w-full sm:w-[480px] sm:mx-4 bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[620px] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Select Laboratory</h2>
            <p className="text-xs text-slate-400 mt-0.5">Choose the destination lab for this request</p>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                title="Refresh labs"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name, location or service…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "Enter" && filtered.length === 1) handleSelect(filtered[0]);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 placeholder-slate-400"
            />
          </div>
        </div>

        {/* Lab list */}
        <ul className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <li className="px-5 py-8 text-sm text-slate-400 text-center flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-slate-300" />
              Loading laboratories…
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-5 py-8 text-sm text-slate-400 text-center">No laboratories found</li>
          ) : (
            filtered.map((lab) => {
              const isSelected = lab.id === selected?.id;
              return (
                <li key={lab.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(lab)}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left active:bg-medical-50 ${
                      isSelected ? "bg-medical-50" : "hover:bg-slate-50"
                    }`}
                  >
                    {lab.logo_url ? (
                      <img src={lab.logo_url} alt={lab.name} className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-medical-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold truncate ${isSelected ? "text-medical-800" : "text-slate-800"}`}>
                        {lab.name}
                      </p>
                      {lab.address && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />{lab.address}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-medical-500 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Safe area (iOS) */}
        <div className="sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }} />
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// Searchable lab picker trigger (opens modal)
function LabSearch({
  labs,
  loading,
  value,
  onChange,
  error,
  onRefresh,
}: {
  labs: Lab[];
  loading: boolean;
  value: string;
  onChange: (labId: string) => void;
  error?: string;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const selectedLab = labs.find((l) => l.id === value);

  function handleSelect(lab: Lab) {
    onChange(lab.id);
  }

  function clear() {
    onChange("");
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        Destination Laboratory <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5 align-middle" aria-label="required" />
      </label>
      {selectedLab ? (
        <div className="w-full rounded-xl border border-medical-300 bg-medical-50 px-4 py-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 min-w-0 flex-1 text-left"
          >
            {selectedLab.logo_url ? (
              <img src={selectedLab.logo_url} alt={selectedLab.name} className="w-6 h-6 rounded-md object-cover shrink-0" />
            ) : (
              <Building2 className="w-4 h-4 text-medical-600 shrink-0" />
            )}
            <span className="text-sm font-medium text-medical-800 truncate">{selectedLab.name}</span>
          </button>
          <button
            type="button"
            onClick={clear}
            className="p-0.5 rounded hover:bg-medical-100 text-medical-400 hover:text-medical-700 shrink-0 ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={loading}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 flex items-center gap-2.5 text-left hover:border-slate-300 hover:bg-slate-50 transition-all focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 disabled:opacity-60"
        >
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-sm text-slate-400 flex-1">
            {loading ? "Loading laboratories…" : "Search by name, location or service…"}
          </span>
          {loading && <RefreshCw className="w-3.5 h-3.5 text-slate-300 animate-spin shrink-0" />}
        </button>
      )}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {mounted && open && (
        <LabSearchModal
          labs={labs}
          loading={loading}
          selected={selectedLab}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}


// Full lab details modal — bottom sheet on mobile, centered dialog on desktop
function LabDetailsModal({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const services = (lab.service_categories as string[] | null) ?? [];
  const certs = (lab.certifications as string[] | null) ?? [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Drag handle visible on mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Sticky header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-5 pt-3 pb-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            {lab.logo_url ? (
              <img src={lab.logo_url} alt={lab.name} className="w-10 h-10 rounded-xl object-cover shadow-sm" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-medical-600" />
              </div>
            )}
            <div>
              <h2 className="font-bold text-slate-800 text-base leading-tight">{lab.name}</h2>
              {lab.address && (
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />{lab.address}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-6">
          {lab.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{lab.description}</p>
          )}

          {/* Contact */}
          {(((lab.phones as string[] | null) ?? []).length > 0) && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Contact</p>
              <div className="flex flex-col gap-2">
                {((lab.phones as string[] | null) ?? []).map((ph, i) => (
                  <a key={i} href={`tel:${ph}`}
                    className="flex items-center gap-2 text-sm text-medical-700 font-medium hover:text-medical-900 transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-medical-50 flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5 text-medical-500" />
                    </div>
                    {ph}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Services */}
          {services.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Services Offered
              </p>
              <div className="flex flex-wrap gap-2">
                {services.map((s) => (
                  <span key={s} className="text-xs bg-medical-50 text-medical-700 border border-medical-100 px-3 py-1.5 rounded-full font-medium">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Certifications */}
          {certs.length > 0 && (
            <div className="pb-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" /> Certifications &amp; Accreditations
              </p>
              <div className="flex flex-wrap gap-2">
                {certs.map((c) => (
                  <span key={c} className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5">
                    <Award className="w-3 h-3" />{c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact lab context strip shown at the top of steps 2-4
function LabInfoBar({ lab, onViewMore }: { lab: Lab; onViewMore: () => void }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {lab.logo_url ? (
            <img src={lab.logo_url} alt={lab.name} className="w-5 h-5 rounded object-cover shrink-0" />
          ) : (
            <Building2 className="w-4 h-4 text-medical-600 shrink-0" />
          )}
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-600 truncate block">{lab.name}</span>
            {lab.address && (
              <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />{lab.address}
              </span>
            )}
            <button
              type="button"
              onClick={onViewMore}
              className="mt-0.5 text-xs text-medical-600 hover:text-medical-800 underline underline-offset-2 font-medium transition-colors"
            >
              View details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LearnMoreModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-backdrop-in"
      style={{ backgroundColor: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-medical-50 via-white to-sky-50 px-6 pt-6 pb-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-medical-600 flex items-center justify-center shrink-0 shadow-md">
            <FlaskConical className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-800">About Poveon</h3>
            <p className="text-xs text-slate-400 mt-0.5">Secure lab request platform</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            Poveon lets licensed healthcare professionals send laboratory test requests directly to accredited labs — no account or login required.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Select your destination lab, enter your patient's details and your professional information, and submit. The lab is notified instantly and you receive email confirmation at every stage.
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            No faxes, no delays — fast, encrypted communication between clinicians and labs.
          </p>
        </div>
      </div>
    </div>
  );
}

export function DoctorRequestForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labsLoading, setLabsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateRequestResponse | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(true);
  const [bankSkipped, setBankSkipped] = useState(false);
  const [labDetailsOpen, setLabDetailsOpen] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [doctorEditing, setDoctorEditing] = useState(false);
  const [doctorOptionalOpen, setDoctorOptionalOpen] = useState(false);
  const [savedProfile, setSavedProfile] = useState<{ prefix: string; name: string; email: string; phone: string; hospital: string; bankName: string; bankCode: string; accountNumber: string; accountName: string } | null>(null);
  const [bankCode, setBankCode] = useState("");
  const [bankVerified, setBankVerified] = useState(false);
  const [maxStep, setMaxStep] = useState(1);

  const fetchLabs = useCallback(() => {
    setLabsLoading(true);
    fetch("/api/labs")
      .then((r) => r.json())
      .then((data) => setLabs(data.labs ?? []))
      .catch(() => toast.error("Failed to load laboratories"))
      .finally(() => setLabsLoading(false));
  }, []);

  useEffect(() => {
    fetchLabs();
  }, [fetchLabs]);

  // Scroll listener — compact header when user scrolls past ~80px inside the main scrollable area
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    function onScroll() {
      const top = main?.scrollTop ?? 0;
      // Hysteresis: collapse labels past 100px, restore them below 60px
      // This prevents flickering when the user is near the threshold.
      setScrolled((prev) => {
        if (prev && top < 60) return false;
        if (!prev && top > 100) return true;
        return prev;
      });
    }
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  // Load saved referrer profile from localStorage
  function loadSavedProfile() {
    try {
      const raw = localStorage.getItem(DOCTOR_STORAGE_KEY);
      if (raw) {
        const profile = JSON.parse(raw) as { prefix: string; name: string; email: string; phone: string; hospital: string; bankName: string; bankCode: string; accountNumber: string; accountName: string };
        if (profile.name || profile.email) {
          setSavedProfile(profile);
          setBankOpen(false);
          if (profile.bankCode) setBankCode(profile.bankCode);
          if (profile.bankCode && profile.accountNumber && profile.accountName) {
            setBankVerified(true);
          }
          setForm((prev) => ({
            ...prev,
            doctor_prefix: profile.prefix || "",
            doctor_name: profile.name || "",
            doctor_email: profile.email || "",
            doctor_phone: profile.phone || "",
            doctor_hospital: profile.hospital || "",
            doctor_bank_name: profile.bankName || "",
            doctor_account_number: profile.accountNumber || "",
            doctor_account_name: profile.accountName || "",
          }));
          return;
        }
      }
    } catch { /* ignore storage errors */ }
    // No saved profile
    setSavedProfile(null);
  }

  useEffect(() => { loadSavedProfile(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function clearDoctorProfile() {
    try { localStorage.removeItem(DOCTOR_STORAGE_KEY); } catch { /* ignore */ }
    setSavedProfile(null);
    setDoctorEditing(false);
    setDoctorOptionalOpen(false);
    setBankOpen(true); // Re-open bank section for fresh entry
    setBankCode("");
    setBankVerified(false);
    setForm((prev) => ({
      ...prev,
      doctor_prefix: "",
      doctor_name: "",
      doctor_email: "",
      doctor_phone: "",
      doctor_hospital: "",
      doctor_bank_name: "",
      doctor_account_number: "",
      doctor_account_name: "",
    }));
  }

  function validateStep(s: number): boolean {
    const errs: Partial<FormData> = {};
    if (s === 1 && !form.lab_id) errs.lab_id = "Please select a laboratory";
    if (s === 2) {
      if (!form.patient_name.trim()) errs.patient_name = "Required";
      if (!form.dob) errs.dob = "Required";
      if (!form.sex) errs.sex = "Required";
      if (form.patient_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email))
        errs.patient_email = "Invalid email";
    }
    if (s === 3) {
      if (!form.doctor_name.trim()) errs.doctor_name = "Required";
      if (!form.doctor_email.trim()) errs.doctor_email = "Required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.doctor_email))
        errs.doctor_email = "Invalid email";
      if (!bankSkipped) {
        if (!form.doctor_bank_name.trim()) errs.doctor_bank_name = "Required";
        if (!form.doctor_account_number.trim()) errs.doctor_account_number = "Required";
        if (!form.doctor_account_name.trim()) errs.doctor_account_name = "Required";
      }
    }
    if (s === 5 && !form.tests.trim()) errs.tests = "Required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function persistDoctorProfile() {
    try {
      localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify({
        prefix: form.doctor_prefix,
        name: form.doctor_name,
        email: form.doctor_email,
        phone: form.doctor_phone,
        hospital: form.doctor_hospital,
        bankName: form.doctor_bank_name,
        bankCode: bankCode,
        accountNumber: form.doctor_account_number,
        accountName: form.doctor_account_name,
      }));
    } catch { /* ignore storage errors */ }
  }

  function handleNext() {
    if (validateStep(step)) {
      // Persist profile as soon as the user leaves Step 3
      if (step === 3) persistDoctorProfile();
      const next = Math.min(5, step + 1);
      setStep(next);
      setMaxStep((m) => Math.max(m, next));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleJumpToStep(target: number) {
    // Allow jumping to any visited step freely; validate when jumping forward
    if (target === step) return;
    if (target > step) {
      if (!validateStep(step)) return;
      if (step === 3) persistDoctorProfile();
    } else {
      setErrors({});
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    if (!validateStep(4)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: CreateRequestResponse = await res.json();
      if (data.success) {
        persistDoctorProfile();
        setResult(data);
      } else {
        toast.error(data.error ?? "Failed to submit request");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.success) {
    return (
      <SuccessScreen
        code={result.code!}
        labName={result.lab?.name ?? ""}
        labAddress={result.lab?.address ?? ""}
        labPhones={result.lab?.phones ?? []}
        onReset={() => { setResult(null); setForm(INITIAL); setStep(1); setMaxStep(1); loadSavedProfile(); }}
      />
    );
  }

  const selectedLab = labs.find((l) => l.id === form.lab_id);

  return (
    <div className="animate-fade-in">
      {/* Sticky header + step indicator */}
      <div className={`sticky top-0 z-10 -mx-4 px-4 transition-all duration-300 ${scrolled ? "pt-2 pb-2" : "pt-3 pb-3"}`}>
        {/* Full-width frosted background */}
        <div className="absolute inset-0 left-1/2 -translate-x-1/2 w-screen bg-white/80 backdrop-blur-md border-b border-white/60 -z-10" />

        {/* Lab info / branding */}
        <div className="mb-4">
            {selectedLab ? (() => {
              const phones = (selectedLab.phones as string[] | null) ?? [];
              return (
                <div className="relative overflow-hidden rounded-2xl border border-medical-100 bg-gradient-to-r from-medical-50 via-white to-sky-50 shadow-sm animate-fade-in-up">
                  <div className="absolute -top-6 -right-6 w-28 h-28 bg-medical-100/40 rounded-full blur-2xl pointer-events-none" />
                  <div className="relative px-4 py-3 flex items-center gap-3">
                    {selectedLab.logo_url ? (
                      <img
                        src={selectedLab.logo_url}
                        alt={selectedLab.name}
                        className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm ring-2 ring-white"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0 border border-medical-200">
                        <Building2 className="w-5 h-5 text-medical-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 leading-tight truncate">{selectedLab.name}</p>
                      {selectedLab.address && (
                        <p className="text-xs text-slate-400 flex items-start gap-1 mt-0.5 overflow-hidden">
                          <MapPin className="w-3 h-3 shrink-0 text-medical-300 mt-0.5" />
                          <span className="truncate">{selectedLab.address}</span>
                        </p>
                      )}
                      {step > 1 && (
                        <button
                          type="button"
                          onClick={() => setLabDetailsOpen(true)}
                          className="mt-1 text-xs text-medical-600 hover:text-medical-800 font-semibold underline underline-offset-2 transition-colors"
                        >
                          View details
                        </button>
                      )}
                    </div>
                    {/* Call button */}
                    {phones.length > 0 && (
                      <div className="shrink-0">
                        {phones.length === 1 ? (
                          <a
                            href={`tel:${phones[0]}`}
                            className="w-9 h-9 rounded-xl bg-medical-600 hover:bg-medical-700 text-white flex items-center justify-center shadow-sm transition-colors"
                            title={`Call ${selectedLab.name}`}
                          >
                            <PhoneCall className="w-4 h-4" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCallOpen(true)}
                            className="w-9 h-9 rounded-xl bg-medical-600 hover:bg-medical-700 text-white flex items-center justify-center shadow-sm transition-colors"
                            title={`Call ${selectedLab.name}`}
                          >
                            <PhoneCall className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className="relative py-2 animate-fade-in">
                <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
                  <div className="absolute top-2 left-0 w-40 h-40 bg-medical-100/50 rounded-full blur-3xl animate-float" style={{ animationDelay: "0s" }} />
                  <div className="absolute top-0 right-4 w-32 h-32 bg-sky-100/60 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.8s" }} />
                  <div className="absolute -top-2 left-1/2 w-24 h-24 bg-indigo-100/40 rounded-full blur-2xl animate-float" style={{ animationDelay: "3.2s" }} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md shrink-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 ring-1 ring-white/10">
                    <FlaskConical className="w-[18px] h-[18px] text-sky-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700 leading-snug">
                      Submit a lab request for your patient.
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      No account needed.{" "}
                      <button
                        type="button"
                        onClick={() => setLearnMoreOpen(true)}
                        className="text-medical-600 hover:text-medical-800 font-semibold underline underline-offset-2 transition-colors"
                      >
                        Learn more
                      </button>
                    </p>
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const done = num < step;
            const active = num === step;
            const visited = num <= maxStep;
            const Icon = s.icon;
            return (
              <div key={s.title} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => visited && handleJumpToStep(num)}
                    disabled={!visited}
                    className={`rounded-full flex items-center justify-center transition-all border-2 focus:outline-none ${
                      done
                        ? "w-7 h-7 bg-slate-700 text-white border-slate-700 cursor-pointer hover:bg-medical-600 hover:border-medical-600"
                        : active
                        ? "w-8 h-8 bg-slate-900 text-white border-slate-800 ring-4 ring-slate-900/10 cursor-default"
                        : visited
                        ? "w-7 h-7 bg-slate-200 text-slate-500 border-slate-300 cursor-pointer hover:bg-medical-100 hover:border-medical-400"
                        : "w-7 h-7 bg-white text-slate-300 border-slate-200 cursor-default"
                    }`}
                    aria-label={visited ? `Go to step ${num}: ${s.title}` : s.title}
                  >
                    {done
                      ? <Check className="w-3 h-3" />
                      : <Icon className={active ? "w-3.5 h-3.5" : "w-3 h-3"} />}
                  </button>
                  <p className={`text-xs whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out hidden sm:block ${
                    scrolled ? "max-h-0 opacity-0 mt-0" : "max-h-5 opacity-100 mt-1"
                  } ${
                    active ? "font-semibold text-slate-800" : done ? "font-medium text-slate-500 cursor-pointer" : "font-medium text-slate-400"
                  }`}>
                    {s.title}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-4 rounded transition-all ${done ? "bg-slate-400" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div
        className="glass-card p-6 mt-4 mb-2"
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const target = e.target as HTMLElement;
          if (target.tagName !== "INPUT") return;
          e.preventDefault();
          const inputs = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              'input:not([type="hidden"]):not([disabled]), select:not([disabled])'
            )
          );
          const idx = inputs.indexOf(target as HTMLInputElement);
          if (idx >= 0 && idx < inputs.length - 1) {
            inputs[idx + 1].focus();
          }
        }}
      >

        {/* Step 1: Choose Lab */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-medical-600" />
              Select Laboratory
            </h2>
            <LabSearch
              labs={labs}
              loading={labsLoading}
              value={form.lab_id}
              onChange={(id) => set("lab_id", id)}
              error={errors.lab_id}
              onRefresh={fetchLabs}
            />
            {selectedLab && (
              <div className="rounded-2xl border border-medical-100 overflow-hidden">
                {/* Lab identity row */}
                <div className="bg-medical-50 px-4 pt-4 pb-3 flex items-start gap-3">
                  {selectedLab.logo_url ? (
                    <img src={selectedLab.logo_url} alt={selectedLab.name} className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-medical-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-medical-900 leading-tight">{selectedLab.name}</p>
                    {selectedLab.address && (
                      <p className="text-xs text-medical-600 flex items-start gap-1 mt-1">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />{selectedLab.address}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setLabDetailsOpen(true)}
                      className="mt-1.5 text-xs text-medical-600 hover:text-medical-800 underline underline-offset-2 font-medium"
                    >
                      View details
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Patient Information — progressive disclosure */}
        {step === 2 && (() => {
          // Sub-step visibility: each field reveals the next
          const showDobSex = form.patient_name.trim().length > 0;
          const showEmail = showDobSex && !!form.dob && !!form.sex;
          const showContact = showEmail;

          // Sub-step indicator: 1 = Name, 2 = DOB/Sex, 3 = Email, 4 = Contact
          const patientSubStep = !showDobSex ? 1 : !showEmail ? 2 : !showContact ? 3 : 4;
          const patientTotalSteps = 4;

          return (
            <div className="space-y-5">
              <div className="sticky top-36 z-[5] -mx-6 px-6 pt-2 bg-white/95 backdrop-blur-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700">
                  <User className="w-4 h-4 text-medical-600" />
                  Patient Information
                </h2>
                {/* Sub-step dots */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {Array.from({ length: patientTotalSteps }).map((_, i) => (
                    <div
                      key={i}
                      className={`shrink-0 rounded-full transition-all duration-300 ${
                        i < patientSubStep - 1
                          ? "w-5 h-1.5 bg-medical-500"
                          : i === patientSubStep - 1
                          ? "w-3 h-1.5 bg-medical-400"
                          : "w-1.5 h-1.5 bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
              </div>
              </div>

              {/* Sub-step 1: Name */}
              <Input
                label="Patient Full Name"
                required
                placeholder="e.g. Amara Okonkwo"
                value={form.patient_name}
                onChange={(e) => set("patient_name", e.target.value)}
                error={errors.patient_name}
              />

              {/* Sub-step 2: DOB + Sex — revealed after name */}
              {showDobSex && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in-up">
                  <DobInput
                    required
                    value={form.dob}
                    onChange={(iso) => set("dob", iso)}
                    error={errors.dob}
                  />
                  {/* Sex selector */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-slate-700">
                      Sex<span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-1.5 align-middle" aria-label="required" />
                    </label>
                    <div className="flex gap-2">
                      {(["male", "female"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set("sex", s)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold ${
                            form.sex === s
                              ? "border-medical-400 bg-medical-50 text-medical-700"
                              : errors.sex
                              ? "border-red-300 bg-white/60 text-slate-500 hover:border-slate-300"
                              : "border-slate-200 bg-white/60 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {s === "male"
                            ? <MarsIcon className={`w-4 h-4 ${form.sex === s ? "text-medical-500" : "text-slate-400"}`} />
                            : <VenusIcon className={`w-4 h-4 ${form.sex === s ? "text-medical-500" : "text-slate-400"}`} />}
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                    {errors.sex && <p className="text-xs text-red-600 font-medium">{errors.sex}</p>}
                  </div>
                </div>
              )}

              {/* Sub-step 3: Email — revealed after DOB + Sex */}
              {showEmail && (
                <div className="flex flex-col gap-1 animate-fade-in-up">
                  <label htmlFor="patient_email" className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    Patient Email
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Recommended</span>
                  </label>
                  <Input
                    id="patient_email"
                    type="email"
                    placeholder="patient@example.com"
                    hint="Patient will receive their request code & results by email"
                    value={form.patient_email}
                    onChange={(e) => set("patient_email", e.target.value)}
                    error={errors.patient_email}
                  />
                </div>
              )}

              {/* Sub-step 4: Address & Phone — revealed after email shown */}
              {showContact && (
                <div className="animate-fade-in-up">
                  {form.address || form.patient_phone ? (
                    <div className="border-2 border-emerald-200 bg-emerald-50/30 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setContactOpen((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-emerald-50/50 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-sm font-semibold text-slate-700">Additional details added</span>
                        </span>
                        <ChevronDown className={`w-4 h-4 text-emerald-500 transition-transform shrink-0 ${contactOpen ? "rotate-180" : ""}`} />
                      </button>
                      {contactOpen && (
                        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-emerald-100 bg-emerald-50/20">
                          <Input
                            label="Patient Address"
                            placeholder="Home address"
                            value={form.address}
                            onChange={(e) => set("address", e.target.value)}
                          />
                          <PhoneInput
                            label="Patient Phone"
                            value={form.patient_phone}
                            onChange={(v) => set("patient_phone", v)}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border-2 border-slate-200 bg-slate-50/40 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setContactOpen((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <div className="text-left">
                            <span className="text-sm font-semibold text-slate-700">Address &amp; Phone</span>
                            <p className="text-xs text-slate-400 mt-0.5">Optional — add patient address and phone number</p>
                          </div>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ml-3 ${contactOpen ? "rotate-180" : ""}`} />
                      </button>
                      {contactOpen && (
                        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100 bg-slate-50/20">
                          <Input
                            label="Patient Address"
                            placeholder="Home address"
                            value={form.address}
                            onChange={(e) => set("address", e.target.value)}
                          />
                          <PhoneInput
                            label="Patient Phone"
                            value={form.patient_phone}
                            onChange={(v) => set("patient_phone", v)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Step 3: Referring Professional — progressive disclosure */}
        {step === 3 && (() => {
          // Sub-step visibility
          const showEmail = form.doctor_name.trim().length > 0;
          const showOptional = showEmail && form.doctor_email.trim().length > 0;
          const showBank = showOptional;

          // Sub-step count for dots: 1=Name, 2=Email, 3=Optional, 4=Bank
          const profileSubStep = !showEmail ? 1 : !showOptional ? 2 : !showBank ? 3 : 4;
          const profileTotalSteps = 4;

          return (
          <div className="space-y-4">
            <div className="sticky top-36 z-[5] -mx-6 px-6 pt-2 bg-white/95 backdrop-blur-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700">
                <Stethoscope className="w-4 h-4 text-medical-600" />
                Your Profile
              </h2>
              {/* Sub-step dots — only show when in edit/new mode */}
              {(!savedProfile || doctorEditing) && (
                <div className="flex shrink-0 items-center gap-1.5">
                  {Array.from({ length: profileTotalSteps }).map((_, i) => (
                    <div
                      key={i}
                      className={`shrink-0 rounded-full transition-all duration-300 ${
                        i < profileSubStep - 1
                          ? "w-5 h-1.5 bg-medical-500"
                          : i === profileSubStep - 1
                          ? "w-3 h-1.5 bg-medical-400"
                          : "w-1.5 h-1.5 bg-slate-200"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
            </div>

            {/* First-time banner — only shown when no saved profile exists */}
            {!savedProfile && (
              <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                <p className="text-xs text-sky-800 leading-relaxed">
                  <span className="font-semibold">Fill this in once.</span> Your details are saved to this device — next time, this step will be pre-filled automatically.
                </p>
              </div>
            )}

            {/* Profile summary card — shown when cache exists and not editing */}
            {savedProfile && !doctorEditing ? (
              <div className="rounded-2xl border border-medical-200 bg-gradient-to-br from-medical-50 to-white overflow-hidden">
                {/* Card header */}
                <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-medical-100 border border-medical-200 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-medical-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 text-sm leading-tight truncate">
                        {[form.doctor_prefix, form.doctor_name].filter(Boolean).join(" ") || "—"}
                      </p>
                      <p className="text-xs text-medical-600 mt-0.5">Saved profile</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDoctorEditing(true)}
                    className="flex items-center gap-1 text-xs text-medical-600 hover:text-medical-800 font-semibold transition-colors shrink-0 mt-0.5"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                </div>
                {/* Card fields */}
                <div className="px-4 pb-3 space-y-1.5 border-t border-medical-100 pt-3">
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                    <span className="text-slate-600 truncate">{form.doctor_email || <span className="text-slate-300 italic">No email</span>}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${form.doctor_phone ? "" : "opacity-50"}`}>
                    <Phone className="w-3 h-3 shrink-0 text-slate-400" />
                    <span className={form.doctor_phone ? "text-slate-600" : "text-slate-400 italic"}>{form.doctor_phone || "No phone saved"}</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${form.doctor_hospital ? "" : "opacity-50"}`}>
                    <Building2 className="w-3 h-3 shrink-0 text-slate-400" />
                    <span className={form.doctor_hospital ? "text-slate-600 truncate" : "text-slate-400 italic"}>{form.doctor_hospital || "No hospital/clinic saved"}</span>
                  </div>
                </div>
                {/* Bank status + clear */}
                <div className="px-4 pb-3 flex items-center justify-between gap-3 border-t border-medical-100 pt-2.5">
                  {!bankSkipped && bankVerified && form.doctor_account_name ? (
                    <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      <Check className="w-3 h-3" /> Bank verified
                    </span>
                  ) : !bankSkipped && (form.doctor_bank_name || form.doctor_account_number) ? (
                    <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-medium">
                      Bank not verified
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">No bank details</span>
                  )}
                  <button
                    type="button"
                    onClick={clearDoctorProfile}
                    className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors shrink-0"
                  >
                    Not you? Clear
                  </button>
                </div>
              </div>
            ) : (
              /* Form fields — shown for new entries or when editing cached profile */
              <>
                {savedProfile && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setDoctorEditing(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
                    >
                      ← Back to saved profile
                    </button>
                  </div>
                )}

                {/* Sub-step 1: Title + Name */}
                <PrefixSelect
                  value={form.doctor_prefix}
                  onChange={(v) => set("doctor_prefix", v)}
                />
                <Input
                  label="Full Name"
                  required
                  placeholder="Firstname Lastname"
                  value={form.doctor_name}
                  onChange={(e) => set("doctor_name", e.target.value)}
                  error={errors.doctor_name}
                />

                {/* Sub-step 2: Email — revealed after name filled */}
                {showEmail && (
                  <div className="animate-fade-in-up">
                    <Input
                      label="Email"
                      type="email"
                      required
                      placeholder="you@hospital.com"
                      hint="You will receive request updates here"
                      value={form.doctor_email}
                      onChange={(e) => set("doctor_email", e.target.value)}
                      error={errors.doctor_email}
                    />
                  </div>
                )}

                {/* Sub-step 3: Phone + Hospital — revealed after email filled */}
                {showOptional && (
                  <div className="animate-fade-in-up">
                    {(form.doctor_phone || form.doctor_hospital) ? (
                      <div className="border-2 border-emerald-200 bg-emerald-50/30 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setDoctorOptionalOpen((v) => !v)}
                          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-emerald-50/50 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-sm font-semibold text-slate-700">Optional details added</span>
                          </span>
                          <ChevronDown className={`w-4 h-4 text-emerald-500 transition-transform shrink-0 ${doctorOptionalOpen ? "rotate-180" : ""}`} />
                        </button>
                        {doctorOptionalOpen && (
                          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-emerald-100 bg-emerald-50/20">
                            <PhoneInput
                              label="Phone"
                              value={form.doctor_phone}
                              onChange={(v) => set("doctor_phone", v)}
                            />
                            <Input
                              label="Hospital or Clinic"
                              placeholder="e.g. Lagos University Teaching Hospital"
                              value={form.doctor_hospital}
                              onChange={(e) => set("doctor_hospital", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border-2 border-slate-200 bg-slate-50/40 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setDoctorOptionalOpen((v) => !v)}
                          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                            <div className="text-left">
                              <span className="text-sm font-semibold text-slate-700">Phone &amp; Hospital</span>
                              <p className="text-xs text-slate-400 mt-0.5">Optional — add your contact and workplace</p>
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ml-3 ${doctorOptionalOpen ? "rotate-180" : ""}`} />
                        </button>
                        {doctorOptionalOpen && (
                          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100 bg-slate-50/20">
                            <PhoneInput
                              label="Phone"
                              value={form.doctor_phone}
                              onChange={(v) => set("doctor_phone", v)}
                            />
                            <Input
                              label="Hospital or Clinic"
                              placeholder="e.g. Lagos University Teaching Hospital"
                              value={form.doctor_hospital}
                              onChange={(e) => set("doctor_hospital", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Bank account details — shown after email is filled (progressive disclosure) */}
            {(showBank || savedProfile) && (
              <div className="animate-fade-in-up">
                {bankSkipped ? (
                  /* Skipped state — compact strip */
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs text-slate-500 font-medium">Bank details skipped</p>
                    <button
                      type="button"
                      onClick={() => { setBankSkipped(false); setBankOpen(true); }}
                      className="text-xs text-medical-600 hover:text-medical-800 font-semibold transition-colors"
                    >
                      + Add details
                    </button>
                  </div>
                ) : (() => {
                  const hasBankContent = bankVerified && !!(form.doctor_bank_name && form.doctor_account_number && form.doctor_account_name);
                  return (
                    <div className={`rounded-xl border-2 overflow-hidden transition-colors ${hasBankContent ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
                      <button
                        type="button"
                        onClick={() => setBankOpen((v) => !v)}
                        className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${hasBankContent ? "hover:bg-emerald-50/50" : "hover:bg-slate-50 bg-slate-50/50"}`}
                      >
                        {hasBankContent ? (
                          <span className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="text-sm font-semibold text-slate-700">Bank details added</span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-700">Bank Account Details</span>
                            {!bankSkipped && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" aria-label="required" />}
                            <span className="hidden sm:inline text-xs text-slate-400 ml-1">For referral payment</span>
                          </div>
                        )}
                        <ChevronDown className={`w-4 h-4 transition-transform shrink-0 ${hasBankContent ? "text-emerald-500" : "text-slate-400"} ${bankOpen ? "rotate-180" : ""}`} />
                      </button>
                      {bankOpen && (
                        <div className={`px-4 pb-4 pt-1 space-y-3 border-t ${hasBankContent ? "border-emerald-100 bg-emerald-50/20" : "border-slate-100"}`}>
                          <BankAccountInput
                            bankName={form.doctor_bank_name}
                            bankCode={bankCode}
                            accountNumber={form.doctor_account_number}
                            accountName={form.doctor_account_name}
                            onBankChange={(name, code) => { set("doctor_bank_name", name); setBankCode(code); setBankVerified(false); }}
                            onAccountNumberChange={(v) => { set("doctor_account_number", v); setBankVerified(false); }}
                            onAccountNameChange={(v) => set("doctor_account_name", v)}
                            onVerifiedChange={setBankVerified}
                            bankError={errors.doctor_bank_name}
                            accountNumberError={errors.doctor_account_number}
                            accountNameError={errors.doctor_account_name}
                          />
                          {!hasBankContent && (
                            <div className="pt-1 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setBankSkipped(true);
                                  set("doctor_bank_name", "");
                                  set("doctor_account_number", "");
                                  set("doctor_account_name", "");
                                }}
                                className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-2"
                              >
                                Skip — I'll settle payment another way
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          );
        })()}

        {/* Step 4: Preferred Schedule (optional) */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
                <CalendarDays className="w-4 h-4 text-medical-600" />
                Preferred Schedule
                <span className="text-xs text-slate-400 font-normal ml-1">(optional)</span>
              </h2>
            </div>
            <p className="text-sm text-slate-500 -mt-1">When does the patient plan to carry out these tests?</p>
            <div className="grid grid-cols-2 gap-3">
              {SCHEDULE_OPTIONS.map((opt) => {
                const selected = form.schedule === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("schedule", selected ? "" : opt.value)}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-2xl border-2 transition-all text-left ${
                      selected
                        ? "border-medical-400 bg-medical-50 ring-2 ring-medical-200"
                        : "border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${selected ? "bg-medical-600" : "bg-slate-100"}`}>
                      <opt.icon className={`w-4 h-4 ${selected ? "text-white" : "text-slate-400"}`} />
                    </div>
                    <span className={`text-sm font-semibold leading-tight ${selected ? "text-medical-800" : "text-slate-700"}`}>{opt.label}</span>
                    <span className={`text-xs ${selected ? "text-medical-600" : "text-slate-400"}`}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            {!form.schedule && (
              <p className="text-xs text-center text-slate-400">You can skip this — it helps the lab plan resources</p>
            )}
          </div>
        )}

        {/* Step 5: Clinical Details + Review */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <TestTube2 className="w-4 h-4 text-medical-600" />
              Clinical Details
            </h2>

            <Textarea
              label="Diagnosis / Clinical Notes"
              placeholder="Brief clinical summary or working diagnosis…"
              rows={3}
              value={form.diagnosis}
              onChange={(e) => set("diagnosis", e.target.value)}
            />
            <Textarea
              label="Laboratory Tests Requested"
              required
              placeholder="e.g. FBC, LFT, Serum electrolytes, Fasting glucose, Urinalysis…"
              rows={4}
              hint="List all tests separated by commas or new lines"
              value={form.tests}
              onChange={(e) => set("tests", e.target.value)}
              error={errors.tests}
            />
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Review</p>
              <SummaryRow label="Lab" value={selectedLab?.name ?? ""} />
              <SummaryRow label="Patient" value={form.patient_name} />
              <SummaryRow label="Date of Birth" value={form.dob ? form.dob.split("-").reverse().join(" / ") : ""} />
              <SummaryRow label="Sex" value={form.sex} capitalize />
              <SummaryRow label="Referrer" value={[form.doctor_prefix, form.doctor_name].filter(Boolean).join(" ")} />
              <SummaryRow label="Referrer Email" value={form.doctor_email} />
              {form.doctor_hospital && <SummaryRow label="Hospital/Clinic" value={form.doctor_hospital} />}
              {form.schedule && <SummaryRow label="Schedule" value={scheduleLabel(form.schedule)} />}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className={`flex gap-3 mt-4 w-full min-w-0 ${step === 1 ? "justify-end" : "justify-between"}`}>
        {step > 1 && (
          <Button variant="ghost" onClick={handleBack} type="button" className="shrink-0">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        )}
        {step < 5 ? (
          <Button onClick={handleNext} type="button" className="shrink-0 ml-auto">
            {step === 4 && !form.schedule ? "Skip & Continue" : "Continue"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            loading={submitting}
            size="lg"
            className="shadow-xl shadow-medical-500/20"
          >
            <FlaskConical className="w-5 h-5" />
            Generate Lab Request
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-slate-400 mt-4 leading-relaxed">
        By submitting, you confirm you are authorised to request these tests on behalf of the patient and receive the results.{" "}
        <a href="/terms" className="underline hover:text-slate-600 transition-colors">Terms &amp; Conditions</a>
        {" "}and{" "}
        <a href="/privacy" className="underline hover:text-slate-600 transition-colors">Privacy Policy</a>.
      </p>

      {/* Lab details modal */}
      {labDetailsOpen && selectedLab && (
        <LabDetailsModal lab={selectedLab} onClose={() => setLabDetailsOpen(false)} />
      )}

      {/* Learn more modal */}
      {learnMoreOpen && <LearnMoreModal onClose={() => setLearnMoreOpen(false)} />}

      {/* Call modal — shown when lab has multiple phone numbers */}
      {callOpen && selectedLab && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-backdrop-in"
          style={{ backgroundColor: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
          onClick={() => setCallOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-medical-50 via-white to-sky-50 px-5 pt-5 pb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-medical-600 flex items-center justify-center shrink-0 shadow-sm">
                <PhoneCall className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-800 leading-tight truncate">{selectedLab.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Select a number to call</p>
              </div>
              <button
                onClick={() => setCallOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/60 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Phone number list */}
            <div className="px-4 py-3 space-y-2 pb-5">
              {((selectedLab.phones as string[] | null) ?? []).map((ph, i) => (
                <a
                  key={i}
                  href={`tel:${ph}`}
                  onClick={() => setCallOpen(false)}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-medical-50 hover:bg-medical-100 border border-medical-100 hover:border-medical-200 text-medical-800 font-semibold text-sm transition-all group"
                >
                  <div className="w-8 h-8 rounded-xl bg-medical-600 group-hover:bg-medical-700 flex items-center justify-center shrink-0 transition-colors">
                    <Phone className="w-4 h-4 text-white" />
                  </div>
                  <span className="flex-1">{ph}</span>
                  <PhoneCall className="w-4 h-4 text-medical-400 group-hover:text-medical-600 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
