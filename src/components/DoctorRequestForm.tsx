"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { parsePhones } from "@/lib/phones";
import type { PhoneEntry } from "@/lib/phones";
import {
  FlaskConical, User, MapPin, Phone, Stethoscope,
  TestTube2, ChevronRight, ChevronLeft, Building2, Check,
  Search, X, PhoneCall, RefreshCw, ChevronDown, Mail,
  Award, Info, Layers, Pencil, Camera, FileText,
  AlertTriangle, Truck, MessageCircle, Heart, Zap,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { TestTagInput, TestTag } from "@/components/ui/TestTagInput";
import { smartSplitTestNames } from "@/lib/smart-split";
import { PhoneInput } from "@/components/PhoneInput";
import { BankAccountInput } from "@/components/BankAccountInput";
import { SuccessScreen } from "@/components/SuccessScreen";
import { PoveonLogo } from "@/components/PoveonLogo";
import { PROFESSIONAL_PREFIXES, PrefixSelectModal, PrefixSelect } from "@/components/PrefixSelect";
import { FastModeComposer } from "@/components/FastModeComposer";
import { hasMinLetters, MIN_NAME_LETTERS } from "@/lib/name-validation";
import type { Lab, CreateRequestResponse } from "@/lib/types";

/** Whole-years age from an ISO "YYYY-MM-DD" date of birth, or "" if not derivable. */
function ageFromIso(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const birth = new Date(iso);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : "";
}

// Module-level session cache with a 60-second TTL so newly added labs appear
// automatically when the modal is opened without requiring a manual refresh.
let _labsCache: Lab[] | null = null;
let _labsCacheTime: number | null = null;
const LABS_CACHE_TTL = 60_000;

interface FormData {
  lab_id: string;
  patient_name: string;
  patient_age: string;
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
  diagnosis: string;
  tests?: string; // used only for error state; rendered via TestTagInput
}

const INITIAL: FormData = {
  lab_id: "",
  patient_name: "",
  patient_age: "",
  sex: "",
  patient_email: "",
  address: "",
  patient_phone: "",
  doctor_prefix: "Dr.",
  doctor_name: "",
  doctor_email: "",
  doctor_phone: "",
  doctor_hospital: "",
  doctor_bank_name: "",
  doctor_account_number: "",
  doctor_account_name: "",
  diagnosis: "",
};




const STEPS = [
  { title: "Location", icon: Building2 },
  { title: "Patient", icon: User },
  { title: "Referral", icon: Stethoscope },
];


const DOCTOR_STORAGE_KEY = "poveon_doctor_profile";

// Fast Mode still works (and the composer is untouched) — only its entry point
// is hidden for now, so every request goes through the full form.
const FAST_MODE_ENTRY_ENABLED = false;

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

        {/* Lab list — capped to 3 rows on mobile (204px) and 5 rows on desktop (340px).
             Each row is py-3.5 (28px) + h-10 icon (40px) = 68px. */}
        <div className="relative">
          <ul className="overflow-y-auto overscroll-contain max-h-[204px] sm:max-h-[340px]">
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
          {/* Gradient fade — hints at more items below */}
          {!loading && filtered.length > 3 && (
            <div className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-white to-transparent sm:hidden" />
          )}
          {!loading && filtered.length > 5 && (
            <div className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-white to-transparent hidden sm:block" />
          )}
        </div>

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
  onOpen,
}: {
  labs: Lab[];
  loading: boolean;
  value: string;
  onChange: (labId: string) => void;
  error?: string;
  onRefresh?: () => void;
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);

  function openSearch() { onOpen?.(); setOpen(true); }
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
      {selectedLab ? (
        <div className="w-full rounded-xl border border-medical-300 bg-medical-50 px-4 py-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={openSearch}
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
            {loading ? "Loading laboratories…" : "Search by name or location…"}
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
          {(() => {
            const phones = parsePhones(lab.phones);
            const waNumbers: string[] = (lab.whatsapp
              ? (() => { try { const p = JSON.parse(lab.whatsapp); return Array.isArray(p) ? p : [lab.whatsapp]; } catch { return [lab.whatsapp]; } })()
              : []).filter((wa: string) => wa.replace(/\D/g, "").length >= 7);
            const hasContact = phones.length > 0 || waNumbers.length > 0;
            return hasContact ? (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Contact</p>
                <div className="flex flex-col gap-2">
                  {phones.map((ph, i) => (
                    <a key={i} href={`tel:${ph.number}`}
                      className="flex items-center gap-2 text-sm text-medical-700 font-medium hover:text-medical-900 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-medical-50 flex items-center justify-center shrink-0">
                        <Phone className="w-3.5 h-3.5 text-medical-500" />
                      </div>
                      <div>
                        {ph.label && <p className="text-xs text-slate-400 leading-none mb-0.5">{ph.label}</p>}
                        <span>{ph.number}</span>
                      </div>
                    </a>
                  ))}
                  {waNumbers.filter(Boolean).map((num, i) => (
                    <a key={`wa-${i}`} href={`https://wa.me/${num.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-emerald-700 font-medium hover:text-emerald-900 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                      </div>
                      {num}
                      <span className="text-xs bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full border border-emerald-100">WhatsApp</span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null;
          })()}

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


interface Location {
  lab_id: string;        // actual lab id — what gets submitted as the request's lab_id
  lab_branch_id: string | null; // LabBranch record id (provenance tracking, not used for routing)
  name: string;
  address: string;
  phones: PhoneEntry[];
  whatsapp?: string | null;
  logo_url?: string | null;
  is_main: boolean;    // true = this branch is the highlighted/default one
  is_parent: boolean;  // true = this entry is the root/parent lab
}

// ─── Branch search dropdown ───────────────────────────────────────────────────

function BranchSearchDropdown({
  locations, selectedIdx, onSelect,
}: { locations: Location[]; selectedIdx: number; onSelect: (idx: number) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selectedLoc = locations[selectedIdx] ?? null;
  const filtered = locations
    .map((loc, idx) => ({ loc, idx }))
    .filter(({ loc }) => !q.trim() || loc.name.toLowerCase().includes(q.toLowerCase()) || loc.address.toLowerCase().includes(q.toLowerCase()));

  function close() { setOpen(false); setQ(""); }

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all ${
          selectedLoc
            ? "border-medical-400 bg-medical-50"
            : "border-slate-200 bg-white/60 hover:border-slate-300"
        }`}
      >
        <MapPin className={`w-4 h-4 shrink-0 ${selectedLoc ? "text-medical-600" : "text-slate-400"}`} />
        <div className="flex-1 min-w-0">
          {selectedLoc ? (
            <>
              <p className="text-sm font-semibold text-medical-800 leading-tight truncate">
                {selectedLoc.name}
                {selectedLoc.is_parent && <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">Main Lab</span>}
                {!selectedLoc.is_parent && selectedLoc.is_main && <span className="ml-2 text-xs bg-medical-100 text-medical-700 px-1.5 py-0.5 rounded-full font-medium">Main Branch</span>}
              </p>
              {selectedLoc.address && (
                <p className="text-xs text-medical-600/70 truncate mt-0.5">{selectedLoc.address}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">Select a branch…</p>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {/* Modal */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={close}
        >
          <div
            className="bg-white w-full sm:w-[420px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[60dvh] sm:max-h-[500px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 shrink-0">
              <p className="text-sm font-bold text-slate-800">Choose a Branch</p>
              <button type="button" onClick={close} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-500">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Search */}
            <div className="px-4 py-2.5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by name or address…"
                  className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
                />
                {q && (
                  <button type="button" onClick={() => setQ("")} className="text-slate-400 hover:text-slate-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {/* List */}
            <div className="overflow-y-auto flex-1 overscroll-contain">
              {filtered.map(({ loc, idx }) => {
                const isSelected = selectedIdx === idx;
                return (
                  <button
                    key={loc.lab_id + idx}
                    type="button"
                    onClick={() => { onSelect(idx); close(); }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 border-b border-slate-50 last:border-0 ${
                      isSelected ? "bg-medical-50/60" : ""
                    }`}
                  >
                    <div className={`mt-1 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? "border-medical-500 bg-medical-500" : "border-slate-300"}`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold leading-tight ${isSelected ? "text-medical-800" : "text-slate-700"}`}>
                        {loc.name}
                        {loc.is_parent && <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">Main Lab</span>}
                        {!loc.is_parent && loc.is_main && <span className="ml-1.5 text-[10px] bg-medical-100 text-medical-700 px-1.5 py-0.5 rounded-full font-medium">Main Branch</span>}
                      </p>
                      {loc.address && (
                        <p className="text-xs text-slate-400 flex items-start gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                          {loc.address}
                        </p>
                      )}
                      {loc.phones.length > 0 && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 shrink-0" />
                          {loc.phones[0].label ? `${loc.phones[0].label}: ` : ""}{loc.phones[0].number}{loc.phones.length > 1 ? ` +${loc.phones.length - 1}` : ""}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">No branches match your search</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function DoctorRequestForm({
  preselectedLabId,
  preselectedLabName,
  locations = [],
  initialLabs,
  chrome = "page",
}: {
  preselectedLabId?: string;
  preselectedLabName?: string;
  locations?: Location[];
  initialLabs?: Lab[];
  /** "modal" = rendered inside the lab-branded paper request sheet. */
  chrome?: "page" | "modal";
} = {}) {
  // On the paper sheet the modal supplies the surface, the letterhead and the
  // 64px title bar — the form drops its own white card and lab header.
  const inModal = chrome === "modal";
  // On the paper sheet, header-level controls (scan slip) are portalled into a
  // slot the modal renders beside the lab's logo.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  // Seed module-level cache from SSR-provided data so first open is instant.
  // Always refresh cache on page load so admin changes appear immediately.
  if (initialLabs) { _labsCache = initialLabs; }
  const labPreselected = !!preselectedLabId;
  // hasLocations = true when there are multiple locations to choose from (parent + at least 1 branch)
  const hasLocations = locations.length > 1;
  // Default to the is_main branch if one exists, otherwise the parent (index 0)
  const defaultLocIdx = locations.length > 0 ? Math.max(0, locations.findIndex((l) => l.is_main)) : 0;
  const startStep = !labPreselected ? 1 : hasLocations ? 1 : 2;
  const [step, setStep] = useState(startStep);
  // Fast Mode — type the tests/patient in plain language and submit instantly.
  // The full multi-step form is the default; doctors can opt into Fast Mode
  // via the entry button (session only, not persisted across visits).
  const [fastMode, setFastMode] = useState(false);
  const enterFastMode = useCallback(() => {
    setFastMode(true);
  }, []);
  const exitFastMode = useCallback(() => {
    setFastMode(false);
  }, []);
  const [form, setForm] = useState<FormData>(() => ({
    ...INITIAL,
    // Use the default location's lab_id when preselected, otherwise empty
    lab_id: (labPreselected && locations.length > 0) ? locations[defaultLocIdx].lab_id : (preselectedLabId ?? ""),
  }));
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [labs, setLabs] = useState<Lab[]>(() => _labsCache ?? []);
  const [labsLoading, setLabsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<CreateRequestResponse | null>(null);
  const [labDetailsOpen, setLabDetailsOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [doctorEditing, setDoctorEditing] = useState(false);
  const [doctorOptionalOpen, setDoctorOptionalOpen] = useState(false);
  const [savedProfile, setSavedProfile] = useState<{ prefix: string; name: string; email: string; phone: string; hospital: string; bankName: string; bankCode: string; accountNumber: string; accountName: string } | null>(null);
  const [maxStep, setMaxStep] = useState(startStep);
  // Index into the locations[] array; drives which lab_id is submitted
  const [selectedLocIdx, setSelectedLocIdx] = useState(defaultLocIdx);
  // Image upload state
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [testImageUrl, setTestImageUrl] = useState<string | null>(null);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  // AI extraction state
  const [imageExtracting, setImageExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<{
    tests_text: string; tests: string[]; diagnosis: string;
    patient_name: string; dob: string; patient_age: number | null; sex: string;
    doctor_name: string; doctor_prefix: string; schedule_hint: string;
    confidence: "high" | "medium" | "low"; low_confidence_items: string[];
  } | null>(null);
  const [extractionDismissed, setExtractionDismissed] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [testTags, setTestTags] = useState<TestTag[]>([]);
  const testsString = testTags.map((t) => t.name).join(", ");

  // Critical / ambulance state
  const [isCritical, setIsCritical] = useState(false);
  const [needsAmbulance, setNeedsAmbulance] = useState(false);
  const [ambulanceNotes, setAmbulanceNotes] = useState("");
  const [conditionExpanded, setConditionExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Step 2: patient contact section active (collapses clinical section)
  const [patientContactActive, setPatientContactActive] = useState(false);
  // Step 4 accordion / lookup states
  const [patientInfoOpen, setPatientInfoOpen] = useState(false);
  const [patientLookupStatus, setPatientLookupStatus] = useState<"idle" | "checking" | "found" | "not_found">("idle");
  // Track what was auto-filled by the last phone lookup so we can clear it when phone changes
  const phoneAutofillRef = useRef<{ phone: string; name: string; age: string; sex: string }>({ phone: "", name: "", age: "", sex: "" });
  // Always-fresh read of form state for use inside async callbacks
  const formRef = useRef(form);
  formRef.current = form;
  // Ref for the patient contact section (used for collapse detection)
  const patientContactRef = useRef<HTMLDivElement>(null);
  // Ref to the top of step content — used to scroll on step transitions
  const stepContentRef = useRef<HTMLDivElement>(null);

  // ── Input validation ───────────────────────────────────────────────────────
  type PhoneValState = { status: "idle" | "checking" | "valid" | "invalid"; network?: string; formatted?: string };
  type EmailValState = { status: "idle" | "checking" | "valid" | "invalid" | "suggestion"; suggestion?: string; reason?: string };

  const [phoneVal, setPhoneVal] = useState<PhoneValState>({ status: "idle" });
  const [patientEmailVal, setPatientEmailVal] = useState<EmailValState>({ status: "idle" });
  const [doctorEmailVal, setDoctorEmailVal] = useState<EmailValState>({ status: "idle" });


  // Step 3: doctor profile check
  const [docProfileStatus, setDocProfileStatus] = useState<"idle" | "checking" | "found_complete" | "found_partial" | "not_found">("idle");
  const [docProfileInfo, setDocProfileInfo] = useState<{ prefix: string | null; full_name: string | null; hospital: string | null; phone: string | null; has_bank: boolean; claimed: boolean } | null>(null);
  // Sub-step for collecting doctor details inline when profile is incomplete (1=name, 2=hospital, 3=bank)
  // Track which fields were auto-filled from a doctor profile lookup so we can clear them on email change
  const docAutofillRef = useRef<{ email: string; prefix: string; name: string; hospital: string }>({ email: "", prefix: "", name: "", hospital: "" });
  // Cache for doctor fields (name, phone, hospital) keyed by email — persists across form interactions
  const docFieldsCacheRef = useRef<Record<string, { name?: string; phone?: string; hospital?: string }>>({});

  // Step 3: free-ride perks available to this doctor for the selected lab.
  // A limited, admin-granted benefit surfaced as a small, opt-in prompt.
  const [availablePerks, setAvailablePerks] = useState<{ id: string; remaining_uses: number; note: string | null }[]>([]);
  const [freeRideEnabled, setFreeRideEnabled] = useState(false);
  const [ridePickupAddress, setRidePickupAddress] = useState("");
  // Login-code gate for sending a free ride (doctor authenticates with their PIN,
  // creating one inline if they don't have one — it doubles as their login code).
  const [doctorHasPin, setDoctorHasPin] = useState<boolean | null>(null);
  const [ridePin, setRidePin] = useState("");

  // Auto-fill from patient profile when phone is entered
  useEffect(() => {
    const phone = form.patient_phone;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/patient/profile?phone=${encodeURIComponent(phone)}`, { signal: controller.signal })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.success) {
            if (data.name && !form.patient_name) { set("patient_name", data.name); setPatientInfoOpen(true); }
            const age = data.age != null ? String(data.age) : ageFromIso(data.dob ?? "");
            if (age && !form.patient_age) set("patient_age", age);
            if (data.sex && !form.sex) set("sex", data.sex);
          }
        })
        .catch(() => null);
    }, 700);
    return () => { clearTimeout(timer); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.patient_phone]);

  // Auto-fill patient details from profile when phone is entered (Step 4)
  useEffect(() => {
    const phone = form.patient_phone;

    // When phone changes, clear any fields that were filled by the previous lookup
    const prev = phoneAutofillRef.current;
    if (prev.phone !== phone) {
      if (prev.name) set("patient_name", "");
      if (prev.age) set("patient_age", "");
      if (prev.sex) set("sex", "");
      phoneAutofillRef.current = { phone, name: "", age: "", sex: "" };
    }

    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) {
      setPatientLookupStatus("idle");
      return;
    }
    setPatientLookupStatus("checking");
    const timer = setTimeout(() => {
      fetch(`/api/patient/profile?phone=${encodeURIComponent(phone)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.success) {
            setPatientLookupStatus("found");
            const f = formRef.current;
            const written = { phone, name: "", age: "", sex: "" };
            if (data.name && !f.patient_name) { set("patient_name", data.name); written.name = data.name; setPatientInfoOpen(true); }
            const age = data.age != null ? String(data.age) : ageFromIso(data.dob ?? "");
            if (age && !f.patient_age) { set("patient_age", age); written.age = age; }
            if (data.sex && !f.sex) { set("sex", data.sex); written.sex = data.sex; }
            phoneAutofillRef.current = written;
          } else {
            setPatientLookupStatus("not_found");
          }
        })
        .catch(() => setPatientLookupStatus("not_found"));
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.patient_phone]);

  // Step 3: debounced doctor email profile check
  useEffect(() => {
    const email = form.doctor_email.trim();
    const prevEmail = docAutofillRef.current.email;

    // When email changes, save current values to cache and restore cached values for new email
    if (prevEmail !== email && prevEmail) {
      // Save current values to cache for previous email
      docFieldsCacheRef.current[prevEmail] = {
        name: form.doctor_name,
        phone: form.doctor_phone,
        hospital: form.doctor_hospital,
      };
    }

    // When the email changes, clear any fields that were auto-filled from the previous profile
    const prev = docAutofillRef.current;
    if (prev.email !== email) {
      // Restore cached values for this email if they exist
      const cached = docFieldsCacheRef.current[email];
      setForm((f) => ({
        ...f,
        doctor_prefix: f.doctor_prefix === prev.prefix ? "" : f.doctor_prefix,
        doctor_name: cached?.name !== undefined ? cached.name : (f.doctor_name === prev.name ? "" : f.doctor_name),
        doctor_phone: cached?.phone !== undefined ? cached.phone : f.doctor_phone,
        doctor_hospital: cached?.hospital !== undefined ? cached.hospital : (f.doctor_hospital === prev.hospital ? "" : f.doctor_hospital),
      }));
      docAutofillRef.current = { email, prefix: "", name: "", hospital: "" };
    }

    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      setDocProfileStatus("idle");
      setDocProfileInfo(null);
      return;
    }
    setDocProfileStatus("checking");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/doc-profile/check?email=${encodeURIComponent(email)}`, { signal: controller.signal })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) { setDocProfileStatus("not_found"); return; }
          if (data.exists) {
            const info = { prefix: data.prefix, full_name: data.full_name, hospital: data.hospital, phone: data.phone, has_bank: !!data.has_bank, claimed: data.claimed !== false };
            setDocProfileInfo(info);
            if (data.profile_complete) {
              setDocProfileStatus("found_complete");
              // Auto-fill form fields from the live profile (only if fields are empty)
              const filled = { email, prefix: data.prefix ?? "", name: data.full_name ?? "", hospital: data.hospital ?? "" };
              docAutofillRef.current = filled;
              setForm((prev) => ({
                ...prev,
                doctor_prefix: prev.doctor_prefix || data.prefix || "",
                doctor_name: prev.doctor_name || data.full_name || "",
                doctor_phone: prev.doctor_phone || data.phone || "",
                doctor_hospital: prev.doctor_hospital || data.hospital || "",
              }));
            } else {
              setDocProfileStatus("found_partial");
            }
          } else {
            setDocProfileInfo(null);
            setDocProfileStatus("not_found");
          }
        })
        .catch(() => { setDocProfileStatus("not_found"); });
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [form.doctor_email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 3: look up free-ride perks the doctor holds for the selected lab.
  useEffect(() => {
    const email = form.doctor_email.trim();
    const labId = form.lab_id;
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (step !== 3 || !validEmail || !labId) {
      setAvailablePerks([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/perks/available", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctor_email: email, lab_id: labId }),
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setAvailablePerks(data?.perks ?? []))
        .catch(() => {});
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [step, form.doctor_email, form.lab_id]);

  // If the perk disappears (email/lab change), reset the opt-in so we never submit a stale one.
  useEffect(() => {
    if (availablePerks.length === 0 && freeRideEnabled) {
      setFreeRideEnabled(false);
    }
  }, [availablePerks, freeRideEnabled]);

  // When the free ride is switched on, find out whether the doctor already has a
  // login code so we can either ask for it or prompt them to create one.
  useEffect(() => {
    const email = form.doctor_email.trim();
    if (!freeRideEnabled || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setDoctorHasPin(null);
      return;
    }
    let cancelled = false;
    fetch("/api/perks/doctor-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, action: "status" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setDoctorHasPin(!!d.has_pin); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [freeRideEnabled, form.doctor_email]);

  const fetchLabs = useCallback((forceRefresh = false) => {
    // Lab-specific pages never show the search — skip entirely
    if (labPreselected) return;
    // Treat a cache older than TTL the same as no cache so new labs appear automatically
    const cacheStale = !_labsCacheTime || Date.now() - _labsCacheTime > LABS_CACHE_TTL;
    if (_labsCache && !forceRefresh && !cacheStale) { setLabs(_labsCache); setLabsLoading(false); return; }
    if (forceRefresh || cacheStale) _labsCache = null;
    setLabsLoading(true);
    fetch("/api/labs")
      .then((r) => r.json())
      .then((data) => {
        _labsCache = data.labs ?? [];
        _labsCacheTime = Date.now();
        setLabs(_labsCache!);
      })
      .catch(() => toast.error("Failed to load laboratories"))
      .finally(() => setLabsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labPreselected]);

  // Idle prefetch — warm the cache while the browser is idle so the modal feels
  // instant. Skip if a fresh cache already exists.
  useEffect(() => {
    const cacheStale = !_labsCacheTime || Date.now() - _labsCacheTime > LABS_CACHE_TTL;
    if (labPreselected || (_labsCache && !cacheStale)) return;
    const id = typeof requestIdleCallback !== "undefined"
      ? requestIdleCallback(() => fetchLabs(), { timeout: 3000 })
      : setTimeout(fetchLabs, 800) as unknown as number;
    return () => {
      if (typeof cancelIdleCallback !== "undefined") cancelIdleCallback(id as number);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Time-of-day greeting
  const [tod, setTod] = useState<"morning" | "afternoon" | "evening">("morning");
  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) setTod("morning");
    else if (h >= 12 && h < 17) setTod("afternoon");
    else setTod("evening");
  }, []);

  // Auto-scroll focused inputs into view on mobile (accounts for keyboard opening)
  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      const el = e.target as HTMLElement;
      if (!el || !["INPUT", "TEXTAREA"].includes(el.tagName)) return;
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 320);
    }
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

  // Track virtual keyboard height so the FAB stays above it on mobile
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      const kh = Math.max(0, window.innerHeight - vv!.offsetTop - vv!.height);
      setKeyboardHeight(kh);
    }
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    if (!inModal) return;
    setHeaderSlot(document.getElementById("paper-sheet-actions"));
  }, [inModal]);

  // Scroll step content into view on user-driven step transitions (not on initial mount)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const el = stepContentRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => clearTimeout(timer);
  }, [step]);

  // Phone validation — runs on debounce after user finishes typing
  useEffect(() => {
    const digits = form.patient_phone.replace(/\D/g, "");
    if (digits.length < 10) { setPhoneVal({ status: "idle" }); return; }
    setPhoneVal({ status: "checking" });
    const timer = setTimeout(() => {
      fetch("/api/validate/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.patient_phone }),
      })
        .then((r) => r.json())
        .then((d) => setPhoneVal(d.valid ? { status: "valid", network: d.network, formatted: d.formatted } : { status: "invalid" }))
        .catch(() => setPhoneVal({ status: "idle" }));
    }, 700);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.patient_phone]);

  // Reset email validation banners whenever the email value changes
  useEffect(() => { setPatientEmailVal({ status: "idle" }); }, [form.patient_email]);
  useEffect(() => { setDoctorEmailVal({ status: "idle" }); }, [form.doctor_email]);

  /** Called onBlur of any email input. Checks typos + MX records. */
  const validateEmailField = useCallback(
    async (email: string, setter: (v: EmailValState) => void) => {
      if (!email.trim()) { setter({ status: "idle" }); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setter({ status: "invalid", reason: "Invalid email format" }); return; }
      setter({ status: "checking" });
      try {
        const res = await fetch("/api/validate/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const d = await res.json();
        if (d.valid) setter({ status: "valid" });
        else if (d.suggestion) setter({ status: "suggestion", suggestion: d.suggestion });
        else setter({ status: "invalid", reason: d.reason });
      } catch {
        setter({ status: "idle" });
      }
    },
    []
  );

  // Hero visibility — when a #lab-hero element exists, track whether it's still in view.
  // Used to hide the logo/name in the sticky header while the hero is prominent.
  const [heroVisible, setHeroVisible] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("lab-hero");
    if (!hero) return;
    setHeroVisible(true);
    const main = document.querySelector("main");
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { root: main, threshold: 0 }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

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

  // Load saved referrer email (and optional cached name/prefix/hospital) from localStorage
  function loadSavedProfile() {
    try {
      const raw = localStorage.getItem(DOCTOR_STORAGE_KEY);
      if (raw) {
        const profile = JSON.parse(raw) as { email?: string; prefix?: string; name?: string; hospital?: string };
        if (profile.email) {
          setSavedProfile(profile as { prefix: string; name: string; email: string; phone: string; hospital: string; bankName: string; bankCode: string; accountNumber: string; accountName: string });
          setForm((prev) => ({
            ...prev,
            doctor_email: profile.email || "",
            ...(profile.name && !prev.doctor_name ? { doctor_name: profile.name } : {}),
            ...(profile.prefix && !prev.doctor_prefix ? { doctor_prefix: profile.prefix } : {}),
            ...(profile.hospital && !prev.doctor_hospital ? { doctor_hospital: profile.hospital } : {}),
          }));
          return;
        }
      }
    } catch { /* ignore storage errors */ }
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
    setDocProfileStatus("idle");
    setDocProfileInfo(null);
    setForm((prev) => ({ ...prev, doctor_email: "" }));
  }

  function validateStep(s: number): boolean {
    const errs: Partial<FormData> = {};
    if (s === 1) {
      if (!labPreselected && !form.lab_id) errs.lab_id = "Please select a laboratory";
      if (labPreselected && hasLocations && selectedLocIdx < 0) errs.lab_id = "Please select a location";
    }
    if (s === 2) {
      if (testTags.length === 0 && !testImageUrl) errs.tests = "Required";
      if (!form.diagnosis.trim()) errs.diagnosis = "Clinical note is required";
      if (!form.patient_phone) errs.patient_phone = "Phone number is required";
      if (!form.patient_name.trim()) errs.patient_name = "Patient name is required";
    }
    if (s === 3) {
      if (!form.doctor_email.trim()) errs.doctor_email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.doctor_email))
        errs.doctor_email = "Invalid email address";
      if (docProfileStatus === "not_found" || docProfileStatus === "found_partial") {
        if (!form.doctor_name.trim()) errs.doctor_name = "Doctor name is required";
        else if (!hasMinLetters(form.doctor_name)) errs.doctor_name = `Please enter your full name (at least ${MIN_NAME_LETTERS} letters)`;
      } else if (form.doctor_name.trim() && !hasMinLetters(form.doctor_name)) {
        errs.doctor_name = `Please enter your full name (at least ${MIN_NAME_LETTERS} letters)`;
      }
      if (!form.doctor_hospital.trim())
        errs.doctor_hospital = "Hospital / clinic is required";
      else if (!hasMinLetters(form.doctor_hospital))
        errs.doctor_hospital = `Please enter the full hospital / clinic name (at least ${MIN_NAME_LETTERS} letters)`;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function persistDoctorProfile() {
    try {
      const toSave: Record<string, string> = { email: form.doctor_email };
      if (form.doctor_name) toSave.name = form.doctor_name;
      if (form.doctor_prefix) toSave.prefix = form.doctor_prefix;
      if (form.doctor_hospital) toSave.hospital = form.doctor_hospital;
      localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify(toSave));
    } catch { /* ignore storage errors */ }
  }

  function handleNext() {
    if (validateStep(step)) {
      const next = Math.min(3, step + 1);
      setStep(next);
      setMaxStep((m) => Math.max(m, next));
    }
  }

  function handleJumpToStep(target: number) {
    // Allow jumping to any visited step freely; validate when jumping forward
    if (target === step) return;
    if (target > step) {
      if (!validateStep(step)) return;
    } else {
      setErrors({});
    }
    setStep(target);
  }

  function handleBack() {
    setErrors({});
    const minStep = (!labPreselected || hasLocations) ? 1 : 2;
    setStep((s) => Math.max(minStep, s - 1));
  }

  // Advance progress bar through realistic stages while submitting
  useEffect(() => {
    if (!submitting) { setProgress(0); return; }
    setProgress(0);
    const t1 = setTimeout(() => setProgress(22), 350);
    const t2 = setTimeout(() => setProgress(45), 950);
    const t3 = setTimeout(() => setProgress(72), 2100);
    const t4 = setTimeout(() => setProgress(88), 3600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [submitting]);

  // Simulate AI extraction progress stages
  useEffect(() => {
    if (!imageExtracting) { setExtractionProgress(0); return; }
    setExtractionProgress(0);
    const t1 = setTimeout(() => setExtractionProgress(25), 500);
    const t2 = setTimeout(() => setExtractionProgress(50), 1500);
    const t3 = setTimeout(() => setExtractionProgress(75), 3000);
    const t4 = setTimeout(() => setExtractionProgress(90), 5000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [imageExtracting]);

  async function handleSubmit() {
    if (!validateStep(2) || !validateStep(3)) return;

    // Login-code gate: a free ride can only be sent by a doctor who already has a
    // login code and enters it here. Verifying it signs them in for the redemption
    // (the create route requires a matching doctor session).
    if (freeRideEnabled && availablePerks.length > 0) {
      if (doctorHasPin !== true) {
        toast.error("Set up a login code in your doctor portal before sending a free ride.");
        return;
      }
      if (!/^\d{4}$/.test(ridePin)) { toast.error("Enter your 4-digit login code to send the free ride."); return; }
      setSubmitting(true);
      try {
        const pinRes = await fetch("/api/perks/doctor-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.doctor_email.trim(), action: "verify", pin: ridePin }),
        });
        const pinData = await pinRes.json();
        if (!pinRes.ok) {
          if (pinData?.needs_create) setDoctorHasPin(false);
          toast.error(pinData?.error ?? "Could not verify your login code.");
          setSubmitting(false);
          return;
        }
      } catch {
        toast.error("Network error verifying your login code.");
        setSubmitting(false);
        return;
      }
    } else {
      setSubmitting(true);
    }

    try {
      const res = await fetch("/api/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tests: testsString || (testImageUrl ? "See attached image" : ""),
          test_image_url: testImageUrl ?? undefined,
          is_critical: isCritical,
          needs_ambulance: needsAmbulance,
          ambulance_notes: ambulanceNotes || undefined,
          free_ride: freeRideEnabled && availablePerks.length > 0,
          free_ride_perk_id: freeRideEnabled ? availablePerks[0]?.id : undefined,
          ride_pickup_address: freeRideEnabled ? ridePickupAddress.trim() : undefined,
        }),
      });
      const data: CreateRequestResponse = await res.json();
      if (data.success) {
        setProgress(100);
        persistDoctorProfile();
        setResult(data);
        if (data.free_ride_redeemed) {
          toast.success(
            "Free ride sent! The patient has been emailed 2 messages — their lab request and their free-ride details with the arrival code. A 3rd email follows with the rider's phone once assigned.",
            { duration: 9000 }
          );
        }
      } else {
        toast.error(data.error ?? "Failed to submit request");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitting) {
    const STAGES = [
      { icon: "🧬", label: "Verifying test details…",  start: 0,  end: 22  },
      { icon: "🏥", label: "Connecting to the lab…",   start: 22, end: 45  },
      { icon: "📋", label: "Creating your request…",   start: 45, end: 72  },
      { icon: "✉️", label: "Sending confirmations…",   start: 72, end: 100 },
    ];
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 space-y-6 animate-fade-in min-h-[300px]">
        {/* Pulsing logo orb */}
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-medical-400 to-sky-500 opacity-20 absolute inset-0 animate-ping" />
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-medical-500 to-sky-400 flex items-center justify-center relative z-10 shadow-lg shadow-medical-500/30">
            <PoveonLogo className="w-8 h-8 text-white" />
          </div>
        </div>

        <div className="text-center space-y-1">
          <p className="text-base font-bold text-slate-800">Submitting your request</p>
          <p className="text-xs text-slate-400">Just a moment while we take care of everything</p>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-medical-500 to-sky-400 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Sequential steps */}
        <div className="w-full max-w-xs space-y-2">
          {STAGES.map((s, i) => {
            const done   = progress >= s.end;
            const active = progress >= s.start && progress < s.end;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-500 ${
                  done   ? "bg-emerald-50 border-emerald-100" :
                  active ? "bg-medical-50 border-medical-100" :
                           "bg-slate-50 border-slate-100 opacity-40"
                }`}
              >
                <span className="text-base">{s.icon}</span>
                <span className={`text-sm flex-1 ${done ? "text-emerald-700" : active ? "text-medical-700" : "text-slate-400"}`}>
                  {s.label}
                </span>
                {done   ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> :
                 active ? <RefreshCw className="w-3.5 h-3.5 text-medical-400 animate-spin shrink-0" /> :
                          null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (result?.success) {
    return (
      <SuccessScreen
        code={result.code!}
        requestId={result.requestId}
        labName={result.lab?.name ?? ""}
        labAddress={result.lab?.address ?? ""}
        labPhones={result.lab?.phones ?? []}
        labWhatsapp={result.lab?.whatsapp ?? null}
        onReset={() => {
          setResult(null);
          setForm({ ...INITIAL, lab_id: locations.length > 0 ? locations[defaultLocIdx].lab_id : (preselectedLabId ?? "") });
          setTestTags([]);
          setStep(startStep);
          setMaxStep(startStep);
          setSelectedLocIdx(defaultLocIdx);
          setTestImageUrl(null);
          setImageUploadError(null);
          setIsCritical(false);
          setNeedsAmbulance(false);
          setAmbulanceNotes("");
          loadSavedProfile();
        }}
      />
    );
  }

  // Fast Mode replaces the whole form with a single type-and-submit screen.
  // Rendered after all hooks so hook order stays stable across the toggle.
  if (fastMode) {
    return (
      <div className="animate-fade-in px-4">
        <FastModeComposer
          preselectedLabId={preselectedLabId ?? (form.lab_id || undefined)}
          preselectedLabName={preselectedLabName}
          locations={locations}
          initialLabs={labs.length ? labs : initialLabs}
          onExit={exitFastMode}
        />
      </div>
    );
  }

  const selectedLab = labs.find((l) => l.id === form.lab_id);

  // When preselected with locations, the "effective lab" for display is the selected location.
  // We synthesise a minimal Lab-shaped object so the header/call modal/details modal always
  // show the correct contact info (branch's own phones, address, etc.)
  const selectedLocation = labPreselected && locations.length > 0 ? locations[selectedLocIdx] : null;
  const displayLab: Lab | null = selectedLab ?? (selectedLocation ? ({
    id: selectedLocation.lab_id,
    name: selectedLocation.name,
    address: selectedLocation.address,
    phones: selectedLocation.phones,
    whatsapp: selectedLocation.whatsapp ?? null,
    logo_url: selectedLocation.logo_url ?? null,
    hero_image_url: null,
    description: "",
    service_categories: [],
    certifications: [],
    email: "",
    prefix: "",
    slug: null,
    hidden: false,
    search_hidden: false,
    free_trial: false,
    notification_email: null,
    request_email: null,
    request_emails: [],
    created_at: "",
  } as Lab) : null);

  // Helper: select a location by index — updates both UI and the form's lab_id
  function selectLocation(idx: number) {
    setSelectedLocIdx(idx);
    set("lab_id", locations[idx].lab_id);
  }

  // Reactively compute whether the current step's required fields are satisfied.
  const stepValid = (() => {
    if (step === 1) {
      if (!labPreselected) return !!form.lab_id;
      if (hasLocations) return selectedLocIdx >= 0;
      return true;
    }
    if (step === 2) {
      return (
        (testTags.length > 0 || !!testImageUrl) &&
        !!form.diagnosis.trim() &&
        !!form.patient_phone.trim() &&
        !!form.patient_name.trim()
      );
    }
    if (step === 3) {
      const emailOk = form.doctor_email.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.doctor_email);
      const nameOk = (docProfileStatus === "found_complete" && !form.doctor_name.trim()) || hasMinLetters(form.doctor_name);
      // A free ride requires the patient's email (for the code) + phone, a pickup
      // address, and the doctor's 4-digit login code (created or entered).
      let rideOk = true;
      if (freeRideEnabled) {
        const patientEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email.trim());
        const patientPhoneOk = form.patient_phone.replace(/\D/g, "").length >= 7;
        const pickupOk = ridePickupAddress.trim().length > 0;
        // The doctor must already have a login code and enter it here.
        const pinOk = doctorHasPin === true && /^\d{4}$/.test(ridePin);
        rideOk = patientEmailOk && patientPhoneOk && pickupOk && pinOk;
      }
      return emailOk && nameOk && hasMinLetters(form.doctor_hospital) && rideOk;
    }
    return true;
  })();

  // The "scan slip" control. On the paper sheet it lives in the header beside
  // the lab's logo (portalled into the slot the modal renders), so the clinical
  // section stays uncluttered.
  const scanSlipControl = (
              <label className="cursor-pointer select-none" aria-label="Scan test request slip">
                <div className={
                  inModal
                    ? `flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors active:scale-95 ${testImageUrl ? "text-emerald-700 hover:bg-emerald-50" : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"}`
                    : `flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-semibold transition-colors active:scale-95 ${testImageUrl ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500 hover:bg-medical-100 hover:text-medical-600"}`
                }>
                  <Camera className={inModal ? "h-3.5 w-3.5" : "w-3.5 h-3.5"} />
                  {testImageUrl ? "Retake" : "Scan slip"}
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,.heic"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const MAX_MB = 10;
                    if (file.size > MAX_MB * 1024 * 1024) {
                      setImageUploadError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_MB} MB.`);
                      e.target.value = "";
                      return;
                    }
                    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
                    if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
                      setImageUploadError(`Unsupported format: ${file.type || file.name.split(".").pop()?.toUpperCase()}. Please use JPEG, PNG, WebP, or HEIC.`);
                      e.target.value = "";
                      return;
                    }
                    setImageUploading(true);
                    setImageUploadProgress(0);
                    setImageUploadError(null);
                    setTestImageUrl(null);
                    setExtractionResult(null);
                    setExtractionDismissed(false);
                    const fd = new FormData();
                    fd.append("file", file);
                    const xhr = new XMLHttpRequest();
                    xhr.upload.onprogress = (ev) => {
                      if (ev.lengthComputable) setImageUploadProgress(Math.round((ev.loaded / ev.total) * 100));
                    };
                    xhr.onload = () => {
                      try {
                        const data = JSON.parse(xhr.responseText);
                        if (data.url) {
                          setTestImageUrl(data.url);
                          setImageUploadProgress(100);
                          setImageExtracting(true);
                          setExtractionProgress(0);
                          fetch("/api/requests/extract-from-image", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ imageUrl: data.url }),
                          })
                            .then((r) => r.json())
                            .then((res) => {
                              if (res.success && res.extracted) {
                                setExtractionResult(res.extracted);
                                if (Array.isArray(res.extracted.tests) && res.extracted.tests.length > 0) {
                                  const lowConfSet = new Set<string>(
                                    (res.extracted.low_confidence_items ?? []).map((s: string) => s.toLowerCase())
                                  );
                                  const expanded = res.extracted.tests.flatMap((n: string) => {
                                    const isLow = lowConfSet.has(n.toLowerCase());
                                    const parts = smartSplitTestNames(n);
                                    const names = parts.length > 0 ? parts : [n];
                                    return names.map((name: string) => ({ name, low_confidence: isLow }));
                                  });
                                  const initialTags: { name: string; catalog_test_id: string | null; low_confidence: boolean }[] = expanded.map(({ name, low_confidence }: { name: string; low_confidence: boolean }) => ({
                                    name,
                                    catalog_test_id: null as string | null,
                                    low_confidence,
                                  }));
                                  setTestTags(initialTags);
                                  const labId = form.lab_id;
                                  Promise.allSettled(
                                    initialTags.map((tag: { name: string; catalog_test_id: string | null; low_confidence: boolean }) =>
                                      fetch(`/api/catalog/search?q=${encodeURIComponent(tag.name)}${labId ? `&lab_id=${encodeURIComponent(labId)}` : ""}&limit=1`)
                                        .then((r) => r.json())
                                        .then((d) => {
                                          const match = d.results?.[0];
                                          if (!match) return null;
                                          const nameLC = tag.name.toLowerCase();
                                          const canonLC = match.canonical_name.toLowerCase();
                                          if (canonLC === nameLC || canonLC.includes(nameLC) || nameLC.includes(canonLC)) {
                                            return { originalName: tag.name, match };
                                          }
                                          return null;
                                        })
                                        .catch(() => null)
                                    )
                                  ).then((results) => {
                                    const upgrades = new Map<string, { id: string; name: string; price?: number; category?: string; is_rapid_test?: boolean }>();
                                    results.forEach((r) => {
                                      if (r.status === "fulfilled" && r.value) {
                                        upgrades.set(r.value.originalName.toLowerCase(), {
                                          id: r.value.match.id,
                                          name: r.value.match.canonical_name,
                                          price: r.value.match.effective_price,
                                          category: r.value.match.category,
                                          is_rapid_test: r.value.match.is_rapid_test,
                                        });
                                      }
                                    });
                                    if (upgrades.size > 0) {
                                      setTestTags((prev) =>
                                        prev.map((t) => {
                                          const up = upgrades.get(t.name.toLowerCase());
                                          if (!up) return t;
                                          return { name: up.name, catalog_test_id: up.id, low_confidence: false, price: up.price, category: up.category, is_rapid_test: up.is_rapid_test };
                                        })
                                      );
                                    }
                                  });
                                }
                                setForm((prev) => ({
                                  ...prev,
                                  diagnosis: res.extracted.diagnosis || prev.diagnosis,
                                  patient_name: prev.patient_name || res.extracted.patient_name,
                                  patient_age: prev.patient_age || (res.extracted.patient_age != null ? String(res.extracted.patient_age) : ageFromIso(res.extracted.dob || "")),
                                  sex: prev.sex || res.extracted.sex,
                                  doctor_name: prev.doctor_name || res.extracted.doctor_name,
                                  doctor_prefix: prev.doctor_prefix || res.extracted.doctor_prefix,
                                }));

                              }
                            })
                            .catch(() => { /* silent — user continues manually */ })
                            .finally(() => {
                              setExtractionProgress(100);
                              setTimeout(() => setImageExtracting(false), 700);
                            });
                        } else {
                          setImageUploadError(data.error ?? "Upload failed. Please try again.");
                        }
                      } catch {
                        setImageUploadError("Upload failed. Please try again.");
                      } finally {
                        setImageUploading(false);
                        e.target.value = "";
                      }
                    };
                    xhr.onerror = () => {
                      setImageUploadError("Network error. Check your connection and try again.");
                      setImageUploading(false);
                      e.target.value = "";
                    };
                    xhr.open("POST", "/api/requests/upload-image");
                    xhr.send(fd);
                  }}
                />
              </label>
  );

  return (
    <div className={`animate-fade-in ${inModal ? "" : "bg-white -mx-4"}`}>
      {/* Sticky header + step indicator
          On lab pages a fixed 64 px mini-header (from LabHeroSection) appears
          once the hero scrolls out of view. Offset by 64 px so they don't overlap. */}
      <div className={`sticky ${preselectedLabId ? "top-16" : "top-0"} z-10 px-4 transition-all duration-300 ${scrolled ? "pt-2 pb-2" : "pt-3 pb-3"}`}>
        {/* Full-width frosted background */}
        <div className={`absolute inset-0 left-1/2 -translate-x-1/2 w-screen backdrop-blur-md border-b -z-10 ${
          inModal ? "bg-white/95 border-stone-200" : "bg-white/80 border-white/60"
        }`} />

        {/* Lab info / branding — only on home page; on lab pages the sticky hero
            shows this, and in the modal the letterhead already does. */}
        {!labPreselected && !inModal && <div className="mb-3">
            {displayLab ? (() => {
              const phones = parsePhones(displayLab.phones);
              const waNumbers: string[] = (displayLab.whatsapp
                ? (() => { try { const p = JSON.parse(displayLab.whatsapp!); return Array.isArray(p) ? p : [displayLab.whatsapp!]; } catch { return [displayLab.whatsapp!]; } })()
                : []).filter((wa: string) => wa.replace(/\D/g, "").length >= 7);
              const hasWa = waNumbers.length > 0;
              return (
                <div className="relative overflow-hidden rounded-2xl border border-medical-100 bg-gradient-to-r from-medical-50 via-white to-sky-50 shadow-sm animate-fade-in-up">
                  <div className="absolute -top-6 -right-6 w-28 h-28 bg-medical-100/40 rounded-full blur-2xl pointer-events-none" />
                  <div className="relative px-3 py-2.5 flex items-center gap-3">

                    {/* Logo — fades out while hero is visible */}
                    <div className={`transition-[width,opacity] duration-300 shrink-0 ${heroVisible ? "w-0 opacity-0 overflow-hidden" : "w-10 opacity-100"}`}>
                      {displayLab.logo_url ? (
                        <img
                          src={displayLab.logo_url}
                          alt={displayLab.name}
                          className="w-10 h-10 rounded-xl object-cover shadow-sm ring-2 ring-white"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center border border-medical-200">
                          <Building2 className="w-5 h-5 text-medical-600" />
                        </div>
                      )}
                    </div>

                    {/* Text column — name fades out while hero is visible, address always shows */}
                    <div className="min-w-0 flex-1">
                      <div className={`overflow-hidden transition-[max-height,opacity] duration-300 ${heroVisible ? "max-h-0 opacity-0" : "max-h-8 opacity-100"}`}>
                        <p className="text-sm font-bold text-slate-800 leading-tight truncate">{displayLab.name}</p>
                      </div>
                      {displayLab.address && (
                        <p className="text-xs text-slate-400 flex items-start gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0 text-medical-300 mt-0.5" />
                          <span className="truncate">{displayLab.address}</span>
                        </p>
                      )}
                      {step > 1 && (
                        <button
                          type="button"
                          onClick={() => setLabDetailsOpen(true)}
                          className="mt-0.5 text-xs text-medical-600 hover:text-medical-800 font-semibold underline underline-offset-2 transition-colors"
                        >
                          More details
                        </button>
                      )}
                    </div>

                    {/* Contact button — WhatsApp preferred over phone */}
                    {(hasWa || phones.length > 0) && (
                      <div className="shrink-0">
                        {hasWa ? (
                          <button
                            type="button"
                            onClick={() => setCallOpen(true)}
                            className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-sm transition-colors"
                            title={`WhatsApp ${displayLab.name}`}
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        ) : phones.length === 1 ? (
                          <a
                            href={`tel:${phones[0].number}`}
                            className="w-9 h-9 rounded-xl bg-medical-600 hover:bg-medical-700 text-white flex items-center justify-center shadow-sm transition-colors"
                            title={`Call ${displayLab.name}`}
                          >
                            <PhoneCall className="w-4 h-4" />
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCallOpen(true)}
                            className="w-9 h-9 rounded-xl bg-medical-600 hover:bg-medical-700 text-white flex items-center justify-center shadow-sm transition-colors"
                            title={`Call ${displayLab.name}`}
                          >
                            <PhoneCall className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : null}
        </div>}

        {/* Fast Mode entry — hidden for now; the full form is the only path.
            Flip FAST_MODE_ENTRY_ENABLED to bring the shortcut back. */}
        {FAST_MODE_ENTRY_ENABLED && (labPreselected || !!form.lab_id) && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={enterFastMode}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-medical-600 underline underline-offset-2 transition-colors"
            >
              <Zap className="w-3 h-3" /> Fast mode
            </button>
          </div>
        )}

        {/* Step indicator. On the sheet it is flat — labels over a rail whose
            fill slides between steps; elsewhere the original numbered circles. */}
        {inModal ? (
          <div className="pt-0.5">
            <div className="flex items-end justify-between gap-2">
              {STEPS.map((st, i) => {
                const num = i + 1;
                const done = num < step;
                const active = num === step;
                const visited = num <= maxStep;
                return (
                  <button
                    key={st.title}
                    type="button"
                    onClick={() => visited && handleJumpToStep(num)}
                    disabled={!visited}
                    className={`flex-1 text-left text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors duration-300 ${
                      active ? "text-slate-900" : done ? "text-stone-500 hover:text-slate-800" : "text-stone-300"
                    } ${visited && !active ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span className="tabular-nums opacity-60">{String(num).padStart(2, "0")}</span>{" "}
                    <span className={active ? "" : "hidden sm:inline"}>{st.title}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative mt-2 h-px w-full bg-stone-200">
              <span
                className="absolute inset-y-0 left-0 block bg-slate-900 transition-[width] duration-500 ease-out"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        ) : (
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
                        ? "w-6 h-6 bg-slate-700 text-white border-slate-700 cursor-pointer hover:bg-medical-600 hover:border-medical-600"
                        : active
                        ? "w-7 h-7 bg-slate-900 text-white border-slate-800 ring-2 ring-slate-900/10 cursor-default"
                        : visited
                        ? "w-6 h-6 bg-slate-200 text-slate-500 border-slate-300 cursor-pointer hover:bg-medical-100 hover:border-medical-400"
                        : "w-6 h-6 bg-white text-slate-300 border-slate-200 cursor-default"
                    }`}
                    aria-label={visited ? `Go to step ${num}: ${s.title}` : s.title}
                  >
                    {done
                      ? <Check className="w-2.5 h-2.5" />
                      : <Icon className={active ? "w-3 h-3" : "w-2.5 h-2.5"} />}
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
                  <div className={`flex-1 h-0.5 mx-1.5 mb-3 rounded transition-all ${done ? "bg-slate-400" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Step content */}
      <div ref={stepContentRef} className="px-4 pt-3 pb-2" style={{ scrollMarginTop: "110px" }}>

        {/* Step 1: Choose Lab / Branch */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Generic URL: lab search */}
            {!labPreselected && (
              <LabSearch
                labs={labs}
                loading={labsLoading}
                value={form.lab_id}
                onChange={(id) => set("lab_id", id)}
                error={errors.lab_id}
                onOpen={() => fetchLabs(false)}
                onRefresh={() => fetchLabs(true)}
              />
            )}

            {/* Lab-specific URL with locations: location selection */}
            {labPreselected && hasLocations && (
              <div className="space-y-3">
                <BranchSearchDropdown
                  locations={locations}
                  selectedIdx={selectedLocIdx}
                  onSelect={selectLocation}
                />
                {errors.lab_id && <p className="text-xs text-red-600 font-medium">{errors.lab_id}</p>}
              </div>
            )}

            {/* Lab-specific URL, no locations: lab confirmation */}
            {labPreselected && !hasLocations && displayLab && (
              <div className="rounded-2xl bg-medical-50 border border-medical-100 px-4 py-4 flex items-center gap-3">
                {displayLab.logo_url ? (
                  <img src={displayLab.logo_url} alt={displayLab.name} className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-sm" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-medical-600" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-medical-900 leading-tight">{displayLab.name}</p>
                  {displayLab.address && (
                    <p className="text-xs text-medical-600 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 shrink-0" />{displayLab.address}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setLabDetailsOpen(true)}
                    className="mt-1 text-xs text-medical-600 hover:text-medical-800 underline underline-offset-2 font-medium transition-colors"
                  >
                    View details
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Referral & Review */}
        {step === 3 && (
          <div className="space-y-4">
                    <div className="space-y-5">
            <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                <Stethoscope className="w-4 h-4 text-medical-600" />
              </div>
              Referral
            </h2>

            <div className="relative pt-1">
              {/* Substep 1: Email — primary identifier */}
              <div className="relative flex gap-3">
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                    form.doctor_email.trim()
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "bg-white border-medical-400 text-medical-600"
                  }`}>
                    {form.doctor_email.trim() ? <Check className="w-3.5 h-3.5" /> : "1"}
                  </div>
                  {form.doctor_email.trim() && (
                    <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-3 min-w-0 space-y-2">
                  <Input
                    label="Your Email"
                    type="email"
                    required
                    placeholder="you@hospital.com"
                    value={form.doctor_email}
                    onChange={(e) => set("doctor_email", e.target.value)}
                    onBlur={() => validateEmailField(form.doctor_email, setDoctorEmailVal)}
                    error={errors.doctor_email}
                  />
                  {savedProfile && form.doctor_email && (
                    <div className="flex items-center justify-between pt-0.5">
                      <p className="text-xs text-slate-400">Saved email</p>
                      <button type="button" onClick={clearDoctorProfile} className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2">Clear</button>
                    </div>
                  )}
                  {/* Doctor profile lookup spinner */}
                  {docProfileStatus === "checking" && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <RefreshCw className="w-3 h-3 animate-spin" />Checking…
                    </div>
                  )}
                  {/* Email domain validation feedback */}
                  {doctorEmailVal.status === "checking" && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <RefreshCw className="w-3 h-3 animate-spin" />Checking email…
                    </div>
                  )}
                  {doctorEmailVal.status === "valid" && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-emerald-700 font-medium">Email looks good</span>
                    </div>
                  )}
                  {doctorEmailVal.status === "suggestion" && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="text-amber-700 truncate">Did you mean <span className="font-semibold">{doctorEmailVal.suggestion}</span>?</span>
                      </div>
                      <button type="button" onClick={() => { set("doctor_email", doctorEmailVal.suggestion!); setDoctorEmailVal({ status: "valid" }); }}
                        className="text-amber-700 font-bold underline underline-offset-2 shrink-0">Use this</button>
                    </div>
                  )}
                  {doctorEmailVal.status === "invalid" && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span className="text-red-700">{doctorEmailVal.reason ?? "Invalid email address"}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Substep 2: Registered doctor — read-only details */}
              {docProfileStatus === "found_complete" && docProfileInfo && (
                <div className="relative flex gap-3 animate-fade-in-up">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 bg-emerald-500 border-emerald-500 text-white">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="flex-1 pb-2 min-w-0 space-y-3">
                    {/* Doctor info — read-only display */}
                    <div className="space-y-3">
                      {/* Name row */}
                      <div className="flex items-start justify-between gap-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</p>
                          <p className="text-sm font-semibold text-slate-800 mt-1">
                            {[docProfileInfo.prefix, docProfileInfo.full_name].filter(Boolean).join(" ")}
                          </p>
                        </div>
                      </div>

                      {/* Email row */}
                      <div className="flex items-start justify-between gap-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</p>
                          <p className="text-sm font-semibold text-slate-800 mt-1">{form.doctor_email}</p>
                        </div>
                      </div>

                      {/* Phone row */}
                      {docProfileInfo.phone && (
                        <div className="flex items-start justify-between gap-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl">
                          <div>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</p>
                            <p className="text-sm font-semibold text-slate-800 mt-1">{docProfileInfo.phone}</p>
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              )}

              {/* Substep 2: Unregistered doctor — name input */}
              {(docProfileStatus === "not_found" || docProfileStatus === "found_partial") && form.doctor_email.trim() && (
                <div className="relative flex gap-3 animate-fade-in-up">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      form.doctor_name.trim()
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-medical-400 text-medical-600"
                    }`}>
                      {form.doctor_name.trim() ? <Check className="w-3.5 h-3.5" /> : "2"}
                    </div>
                    {form.doctor_name.trim() && (
                      <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-2 min-w-0">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-1">
                        <PrefixSelect
                          value={form.doctor_prefix || "Dr."}
                          onChange={(prefix) => set("doctor_prefix", prefix)}
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Input
                          label="Full Name"
                          placeholder="e.g. Chioma Okafor"
                          value={form.doctor_name}
                          onChange={(e) => set("doctor_name", e.target.value)}
                          error={errors.doctor_name}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Hospital — always shown once email (and name for unregistered) is filled; auto-filled but editable */}
              {form.doctor_email.trim() && (
                docProfileStatus === "found_complete" ||
                ((docProfileStatus === "not_found" || docProfileStatus === "found_partial") && !!form.doctor_name.trim())
              ) && (
                <div className="relative flex gap-3 animate-fade-in-up">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      form.doctor_hospital.trim()
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-medical-400 text-medical-600"
                    }`}>
                      {form.doctor_hospital.trim() ? <Check className="w-3.5 h-3.5" /> : docProfileStatus === "found_complete" ? "2" : "3"}
                    </div>
                  </div>
                  <div className="flex-1 pb-2 min-w-0">
                    <Input
                      label="Hospital / Clinic"
                      placeholder="e.g. Lagos University Teaching Hospital"
                      value={form.doctor_hospital}
                      onChange={(e) => set("doctor_hospital", e.target.value)}
                      error={errors.doctor_hospital}
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Free-ride perk — small, opt-in prompt shown only when the doctor
              holds an active free-ride perk for the selected lab. */}
          {availablePerks.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 overflow-hidden shadow-sm animate-fade-in">
              <button
                type="button"
                onClick={() => setFreeRideEnabled((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-emerald-100/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 shadow-sm">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-emerald-800">Offer a free ride to the lab 🚕</p>
                  <p className="text-xs text-emerald-700/80 leading-snug">
                    You can give this patient a free ride to the laboratory. Reserve it for patients who truly need help getting there — it&apos;s limited.
                  </p>
                </div>
                <div className={`w-11 h-6 rounded-full shrink-0 relative transition-colors ${freeRideEnabled ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${freeRideEnabled ? "left-[22px]" : "left-0.5"}`} />
                </div>
              </button>

              {freeRideEnabled && (
                <div className="px-4 pb-4 pt-2 space-y-3 border-t border-emerald-100">
                  <p className="text-xs text-emerald-800/90 leading-snug">
                    Confirm the patient&apos;s details. Their <strong>email is required</strong> — the arrival code is sent there.
                  </p>

                  {/* Patient name */}
                  <div>
                    <label className="block text-xs font-semibold text-emerald-800 mb-1">Patient name</label>
                    <Input
                      placeholder="Full name"
                      value={form.patient_name}
                      onChange={(e) => set("patient_name", e.target.value)}
                    />
                  </div>

                  {/* Patient phone — country-code input */}
                  <div>
                    <label className="block text-xs font-semibold text-emerald-800 mb-1">Patient phone</label>
                    <PhoneInput value={form.patient_phone} onChange={(v) => set("patient_phone", v)} />
                  </div>

                  {/* Patient email (required for the arrival code) */}
                  <div>
                    <label className="block text-xs font-semibold text-emerald-800 mb-1">Patient email <span className="text-red-500">*</span></label>
                    <Input
                      type="email"
                      placeholder="patient@email.com"
                      value={form.patient_email}
                      onChange={(e) => set("patient_email", e.target.value)}
                    />
                    {freeRideEnabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email.trim()) && (
                      <p className="text-[11px] text-red-600 mt-1">A valid patient email is required — the arrival code is emailed to them.</p>
                    )}
                  </div>

                  {/* Pickup address */}
                  <div>
                    <label className="block text-xs font-semibold text-emerald-800 mb-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Pickup address
                    </label>
                    <Input
                      placeholder="Where should the rider pick the patient up?"
                      value={ridePickupAddress}
                      onChange={(e) => setRidePickupAddress(e.target.value)}
                    />
                    {ridePickupAddress.trim().length === 0 && (
                      <p className="text-[11px] text-red-600 mt-1">Enter a pickup address to send the free ride.</p>
                    )}
                  </div>

                  {/* Login-code gate — the doctor must already have a login code. */}
                  <div className="rounded-xl bg-white/70 border border-emerald-100 px-3 py-3 space-y-2">
                    {doctorHasPin === false ? (
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600 leading-snug">
                          You need a login code to send a free ride. Set one up in your{" "}
                          <a href={`/doc-login?email=${encodeURIComponent(form.doctor_email.trim())}`} target="_blank" rel="noopener noreferrer"
                            className="font-semibold text-medical-600 underline underline-offset-2">doctor portal</a>, then return here.
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-emerald-800">Enter your login code to authorise this free ride</p>
                        <input inputMode="numeric" maxLength={4} placeholder="4-digit code" value={ridePin}
                          onChange={(e) => setRidePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-center tracking-[0.4em] font-bold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                        {doctorHasPin === null && (
                          <p className="text-[11px] text-slate-400">Checking your account…</p>
                        )}
                      </>
                    )}
                  </div>

                  <p className="text-[11px] text-amber-700 leading-snug flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    This perk must be used within 7 days and the pickup address cannot be changed once sent. Destination is {hasLocations ? (locations[selectedLocIdx]?.name ?? "the lab") : (selectedLab?.name ?? preselectedLabName ?? "the lab")}.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Review summary */}
          <div className="rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
            <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-50/60 border-b border-slate-100 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-medical-400" />
              <p className="text-xs font-bold text-slate-600 tracking-wide">Review before sending</p>
            </div>
            <div className="divide-y divide-slate-100/80">
              {/* Lab */}
              <div className="px-4 py-3.5 flex items-start justify-between gap-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-20 pt-px">Lab</p>
                <p className="text-sm font-semibold text-slate-800 text-right truncate">{hasLocations ? (locations[selectedLocIdx]?.name ?? preselectedLabName ?? "") : (selectedLab?.name ?? preselectedLabName ?? "")}</p>
              </div>
              {/* Patient */}
              <div className="px-4 py-3.5 flex items-start justify-between gap-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-20 pt-px">Patient</p>
                <div className="text-right min-w-0">
                  {form.patient_name && <p className="text-sm font-semibold text-slate-800 truncate">{form.patient_name}</p>}
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{form.patient_phone}</p>
                  {form.patient_email && <p className="text-xs text-slate-400 mt-0.5">{form.patient_email}</p>}
                  {(form.patient_age || form.sex) && <p className="text-xs text-slate-400 mt-0.5">{form.patient_age ? `${form.patient_age} yrs` : ""}{form.patient_age && form.sex ? " · " : ""}{form.sex}</p>}
                </div>
              </div>
              {/* Clinical */}
              <div className="px-4 py-3.5 flex items-start justify-between gap-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-20 pt-px">Clinical</p>
                <div className="text-right min-w-0">
                  {testImageUrl && <p className="text-xs text-emerald-600 truncate mb-0.5">Image attached</p>}
                  {form.diagnosis && <p className="text-xs text-slate-500 truncate mb-0.5">{form.diagnosis}</p>}
                  <p className="text-sm font-semibold text-slate-800 truncate">{testsString || (testImageUrl ? "See attached image" : "")}</p>
                </div>
              </div>
              {/* Referrer */}
              <div className="px-4 py-3.5 flex items-start justify-between gap-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-20 pt-px">Referrer</p>
                <div className="text-right min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{[form.doctor_prefix, form.doctor_name].filter(Boolean).join(" ")}</p>
                  {form.doctor_hospital && <p className="text-xs text-slate-500 truncate mt-0.5">{form.doctor_hospital}</p>}
                  <p className="text-xs text-slate-400 truncate mt-0.5">{form.doctor_email}</p>
                </div>
              </div>
              {/* Flags */}
              {(isCritical || needsAmbulance) && (
                <div className="px-4 py-3 flex items-center gap-2 flex-wrap bg-slate-50/60">
                  {isCritical && <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full"><AlertTriangle className="w-3 h-3" />Critical</span>}
                  {needsAmbulance && <span className="inline-flex items-center gap-1 text-xs font-semibold bg-orange-50 text-orange-600 border border-orange-200 px-2.5 py-1 rounded-full"><Truck className="w-3 h-3" />Ambulance</span>}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Step 2: Tests & Patient */}
        {step === 2 && (
          <div className="space-y-4">

            {/* Clinical section — collapses to summary when patient contact is focused */}
            {patientContactActive ? (
              /* Collapsed summary */
              <button
                type="button"
                onClick={() => setPatientContactActive(false)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/60 transition-colors text-left animate-fade-in"
              >
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-800 truncate">
                    {testTags.length > 0
                      ? `${testTags.length} test${testTags.length !== 1 ? "s" : ""}${form.diagnosis.trim() ? ` · ${form.diagnosis.trim().slice(0, 40)}${form.diagnosis.trim().length > 40 ? "…" : ""}` : ""}`
                      : testImageUrl ? "Image attached" : ""}
                    {isCritical && " · Critical"}
                    {needsAmbulance && " · Ambulance"}
                  </p>
                </div>
                <span className="text-xs text-emerald-600 font-medium shrink-0">Edit</span>
              </button>
            ) : (
              /* Full clinical section */
              <div className="space-y-3">
                {/* Header: title + camera */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700">
                    <TestTube2 className="w-4 h-4 text-medical-600" />
                    Clinical Details
                  </h2>
                  {/* Camera button */}
                  {!inModal && scanSlipControl}
                </div>

                {/* Substep 1: Tests */}
                <div className="relative flex gap-3">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      (testTags.length > 0 || !!testImageUrl)
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-medical-400 text-medical-600"
                    }`}>
                      {(testTags.length > 0 || !!testImageUrl) ? <Check className="w-3.5 h-3.5" /> : "1"}
                    </div>
                    {(testTags.length > 0 || !!testImageUrl) && (
                      <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">

            <div className="space-y-3">
                  {/* Upload / extraction progress — shown while processing the scanned slip */}
                  {imageUploading ? (
                    (() => {
                      const uploadPct = imageUploadProgress;
                      const UPLOAD_STAGES = [
                        { icon: "📷", label: "Reading your image…", start: 0, end: 40 },
                        { icon: "🧠", label: "Understanding the image…", start: 40, end: 100 },
                      ];
                      return (
                        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 space-y-5">
                          <div className="text-center">
                            <p className="text-sm font-semibold text-slate-700">Uploading image…</p>
                            <p className="text-xs text-slate-400 mt-0.5">{uploadPct < 100 ? `${uploadPct}%` : "Almost done…"}</p>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-medical-500 rounded-full transition-all duration-300" style={{ width: `${uploadPct}%` }} />
                          </div>
                          <div className="space-y-2.5">
                            {UPLOAD_STAGES.map((stage) => {
                              const done = uploadPct >= stage.end;
                              const active = uploadPct >= stage.start && uploadPct < stage.end;
                              return (
                                <div key={stage.label} className={`flex items-center gap-3 transition-opacity duration-300 ${uploadPct < stage.start ? "opacity-30" : "opacity-100"}`}>
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-base transition-all ${done ? "bg-emerald-100" : active ? "bg-medical-100" : "bg-slate-100"}`}>
                                    {done ? "✓" : stage.icon}
                                  </div>
                                  <span className={`text-sm font-medium ${done ? "text-emerald-600" : active ? "text-slate-800" : "text-slate-400"}`}>{stage.label}</span>
                                  {active && <RefreshCw className="w-3.5 h-3.5 text-medical-400 animate-spin ml-auto shrink-0" />}
                                  {done && <span className="text-xs text-emerald-500 ml-auto shrink-0 font-medium">Done</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()
                  ) : imageExtracting ? (
                    (() => {
                      const p = extractionProgress;
                      const SCAN_STAGES = [
                        { icon: "🔍", label: "Reading the document…",        start: 0,  end: 25 },
                        { icon: "🧬", label: "Identifying tests & fields…",  start: 25, end: 50 },
                        { icon: "🏷️", label: "Matching to test catalog…",    start: 50, end: 75 },
                        { icon: "✨", label: "Pre-filling your form…",       start: 75, end: 100 },
                      ];
                      return (
                        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 space-y-5">
                          <div className="text-center">
                            <p className="text-sm font-semibold text-slate-700">Scanning with AI…</p>
                            <p className="text-xs text-slate-400 mt-0.5">Hang tight, this only takes a few seconds</p>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-medical-500 rounded-full transition-all duration-700" style={{ width: `${p}%` }} />
                          </div>
                          <div className="space-y-2.5">
                            {SCAN_STAGES.map((stage) => {
                              const done = p >= stage.end;
                              const active = p >= stage.start && p < stage.end;
                              return (
                                <div key={stage.label} className={`flex items-center gap-3 transition-opacity duration-300 ${p < stage.start ? "opacity-30" : "opacity-100"}`}>
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-base transition-all ${done ? "bg-emerald-100" : active ? "bg-medical-100" : "bg-slate-100"}`}>
                                    {done ? "✓" : stage.icon}
                                  </div>
                                  <span className={`text-sm font-medium ${done ? "text-emerald-600" : active ? "text-slate-800" : "text-slate-400"}`}>{stage.label}</span>
                                  {active && <RefreshCw className="w-3.5 h-3.5 text-medical-400 animate-spin ml-auto shrink-0" />}
                                  {done && <span className="text-xs text-emerald-500 ml-auto shrink-0 font-medium">Done</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()
                  ) : testImageUrl ? (
                    <div className="space-y-2 animate-fade-in-up">
                      {/* Image thumbnail row */}
                      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
                        <img src={testImageUrl} alt="Scanned test request slip" className="w-14 h-14 rounded-lg object-cover border border-emerald-200 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                            <Check className="w-4 h-4" /> Image uploaded
                          </p>
                          {extractionResult && !extractionDismissed ? (
                            <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Fields pre-filled
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{testImageUrl?.split("/").pop()}</p>
                          )}
                        </div>
                        <button type="button" onClick={() => { setTestImageUrl(null); setImageUploadError(null); setExtractionResult(null); setExtractionDismissed(false); setTestTags([]); }} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-400 hover:text-emerald-700 transition-colors shrink-0" aria-label="Remove uploaded image">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Low-confidence warning */}
                      {extractionResult && !extractionDismissed && extractionResult.low_confidence_items.length > 0 && (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                          <span className="text-amber-500 text-sm shrink-0 mt-0.5">⚠</span>
                          <p className="text-xs text-amber-700 flex-1">
                            Please verify: <span className="font-medium">{extractionResult.low_confidence_items.join(", ")}</span>
                          </p>
                          <button type="button" onClick={() => setExtractionDismissed(true)} className="text-amber-400 hover:text-amber-600 transition-colors shrink-0" aria-label="Dismiss">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {imageUploadError && <p className="text-xs text-red-600 font-medium">{imageUploadError}</p>}

                  {/* Tests — always visible; pre-filled after scan */}
                  <TestTagInput
                    label={imageExtracting ? "Laboratory Tests (scanning…)" : "Laboratory Tests Requested"}
                    value={testTags}
                    onChange={setTestTags}
                    labId={form.lab_id}
                    error={errors.tests}
                    disabled={imageExtracting}
                  />

              </div>
                  </div>
                </div>

                {/* Substep 2: Diagnosis + Patient Condition (reveals after tests filled) */}
                {(testTags.length > 0 || !!testImageUrl) && (
                  <div className="relative flex gap-3 animate-fade-in-up">
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                        form.diagnosis.trim()
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "bg-white border-medical-400 text-medical-600"
                      }`}>
                        {form.diagnosis.trim() ? <Check className="w-3.5 h-3.5" /> : "2"}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 space-y-3">
                      <Textarea
                        label="Clinical Note"
                        placeholder="e.g. 35 year old man with symptoms suggestive of sepsis"
                        rows={3}
                        required
                        value={form.diagnosis}
                        onChange={(e) => set("diagnosis", e.target.value)}
                        error={errors.diagnosis}
                      />
                      {/* Patient Condition */}
                      <div className="space-y-2">
                        {!conditionExpanded && !isCritical && !needsAmbulance ? (
                          /* Subtle stable row */
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                              <Heart className="w-3.5 h-3.5 shrink-0" />
                              This patient is stable
                            </div>
                            <button
                              type="button"
                              onClick={() => setConditionExpanded(true)}
                              className="text-xs text-slate-400 hover:text-slate-600 font-medium underline underline-offset-2 transition-colors"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          /* Expanded condition toggles */
                          <div className="space-y-2 animate-fade-in">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setIsCritical((v) => !v)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-all ${
                                  isCritical
                                    ? "bg-red-50 border-red-300 text-red-600 shadow-sm"
                                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                Critical
                              </button>
                              <button
                                type="button"
                                onClick={() => setNeedsAmbulance((v) => !v)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-all ${
                                  needsAmbulance
                                    ? "bg-orange-50 border-orange-300 text-orange-600 shadow-sm"
                                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                              >
                                <Truck className="w-3 h-3" />
                                Ambulance
                              </button>
                              {!isCritical && !needsAmbulance && (
                                <button
                                  type="button"
                                  onClick={() => setConditionExpanded(false)}
                                  className="px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-slate-600 border-2 border-transparent hover:border-slate-200 transition-all"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                            {needsAmbulance && (
                              <div className="animate-fade-in-up">
                                <Textarea
                                  label=""
                                  placeholder="Pickup address or notes for the ambulance team…"
                                  rows={2}
                                  value={ambulanceNotes}
                                  onChange={(e) => setAmbulanceNotes(e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Patient Contact — revealed once tests/clinical note are filled, or once
                dictation has populated any patient field. */}
            {(testTags.length > 0 || !!testImageUrl) &&
              (!!form.diagnosis.trim() || !!form.patient_name.trim() || !!form.patient_phone.trim() || !!form.patient_age.trim() || !!form.sex) && (
              <div
                ref={patientContactRef}
                onFocus={() => setPatientContactActive(true)}
                onBlur={() => {
                  setTimeout(() => {
                    if (patientContactRef.current && !patientContactRef.current.contains(document.activeElement)) {
                      setPatientContactActive(false);
                    }
                  }, 50);
                }}
                className="pt-4 border-t border-slate-100 space-y-5 animate-fade-in-up"
              >
                {patientContactActive && (
                  <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-4 border-b border-slate-100">
                    <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-medical-600" />
                    </div>
                    Patient Contact
                  </h2>
                )}

                <div className="relative pt-1">
                  {/* Substep 1: Phone */}
                  <div className="relative flex gap-3">
                    <div className="flex flex-col items-center shrink-0 pt-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                        form.patient_phone.trim()
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "bg-white border-medical-400 text-medical-600"
                      }`}>
                        {form.patient_phone.trim() ? <Check className="w-3.5 h-3.5" /> : "1"}
                      </div>
                      {form.patient_phone.trim() && (
                        <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-3 min-w-0 space-y-2">
                      <PhoneInput
                        label="Patient Phone"
                        required
                        value={form.patient_phone}
                        onChange={(v) => set("patient_phone", v)}
                        error={errors.patient_phone}
                      />
                      {/* Phone number validation chip */}
                      {phoneVal.status === "checking" && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Verifying number…
                        </div>
                      )}
                      {phoneVal.status === "valid" && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-semibold text-emerald-800">{phoneVal.formatted}</span>
                          {phoneVal.network && <span className="text-emerald-600">· {phoneVal.network}</span>}
                        </div>
                      )}
                      {phoneVal.status === "invalid" && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-amber-700">This doesn&apos;t look like a valid mobile number</span>
                        </div>
                      )}
                      {/* Patient profile lookup status */}
                      {patientLookupStatus === "checking" && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Looking up patient profile…
                        </div>
                      )}
                      {patientLookupStatus === "found" && (
                        <div className="flex items-start gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="text-emerald-800 font-medium">Patient profile found — details pre-filled below</span>
                        </div>
                      )}
                      {patientLookupStatus === "not_found" && (
                        <div className="flex items-start gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-slate-600">New patient — please fill in details below</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Substep 2: Name (also revealed when dictation pre-fills patient details) */}
                  {(form.patient_phone.trim() || form.patient_name.trim() || form.patient_age.trim() || !!form.sex) && (
                    <div className="relative flex gap-3 animate-fade-in-up">
                      <div className="flex flex-col items-center shrink-0 pt-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                          form.patient_name.trim()
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "bg-white border-medical-400 text-medical-600"
                        }`}>
                          {form.patient_name.trim() ? <Check className="w-3.5 h-3.5" /> : "2"}
                        </div>
                        {form.patient_name.trim() && <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />}
                      </div>
                      <div className="flex-1 pb-3 min-w-0 space-y-3">
                        <Input
                          label="Patient Full Name"
                          placeholder="e.g. Amara Okonkwo"
                          value={form.patient_name}
                          onChange={(e) => set("patient_name", e.target.value)}
                          error={errors.patient_name}
                          required
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="Age"
                            type="number"
                            min="0"
                            max="130"
                            placeholder="e.g. 42"
                            value={form.patient_age}
                            onChange={(e) => set("patient_age", e.target.value)}
                          />
                          <div className="flex flex-col gap-1.5">
                            <label className="text-sm font-medium text-slate-700">Sex</label>
                            <select
                              value={form.sex}
                              onChange={(e) => set("sex", e.target.value)}
                              className="w-full rounded-xl border border-slate-200 hover:border-slate-300 bg-white/60 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 transition-colors"
                            >
                              <option value="">Not specified</option>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Substep 3: Email */}
                  {(form.patient_name.trim() || form.patient_email.trim()) && (
                    <div className="relative flex gap-3 animate-fade-in-up">
                      <div className="flex flex-col items-center shrink-0 pt-1">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                          form.patient_email.trim()
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "bg-white border-slate-300 text-slate-400"
                        }`}>
                          {form.patient_email.trim() ? <Check className="w-3.5 h-3.5" /> : "3"}
                        </div>
                      </div>
                      <div className="flex-1 pb-3 min-w-0 space-y-2">
                        <Input
                          label="Patient Email"
                          type="email"
                          placeholder="patient@example.com"
                          hint="Optional — used to send results and track request history"
                          value={form.patient_email}
                          onChange={(e) => set("patient_email", e.target.value)}
                          onBlur={() => validateEmailField(form.patient_email, setPatientEmailVal)}
                          error={errors.patient_email}
                        />
                        {patientEmailVal.status === "checking" && (
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <RefreshCw className="w-3 h-3 animate-spin" />Checking email…
                          </div>
                        )}
                        {patientEmailVal.status === "valid" && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-emerald-700 font-medium">Email looks good</span>
                          </div>
                        )}
                        {patientEmailVal.status === "suggestion" && (
                          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="text-amber-700 truncate">Did you mean <span className="font-semibold">{patientEmailVal.suggestion}</span>?</span>
                            </div>
                            <button type="button" onClick={() => { set("patient_email", patientEmailVal.suggestion!); setPatientEmailVal({ status: "valid" }); }}
                              className="text-amber-700 font-bold underline underline-offset-2 shrink-0">Use this</button>
                          </div>
                        )}
                        {patientEmailVal.status === "invalid" && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span className="text-red-700">{patientEmailVal.reason ?? "Invalid email address"}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Back button — inline */}
      {step > 1 && (
        <div className="mt-4 px-4">
          <Button variant="ghost" onClick={handleBack} type="button" className="shrink-0">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
      )}

      {/* FAB — Next / Submit — fixed bottom-right, appears when step is valid */}
      {stepValid && (
        <div
          className="fixed right-5 z-50 transition-[bottom] duration-150 ease-out"
          style={{ bottom: keyboardHeight > 0 ? `${keyboardHeight + 12}px` : "24px" }}
        >
          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-95 text-white font-bold text-sm shadow-2xl shadow-medical-600/40 transition-all"
            >
              Continue
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-95 disabled:opacity-70 text-white font-bold text-sm shadow-2xl shadow-medical-600/40 transition-all"
            >
              {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <PoveonLogo className="w-5 h-5 text-white" />}
              {submitting ? "Sending…" : "Generate Lab Request"}
            </button>
          )}
        </div>
      )}

      <p className="text-center text-xs text-slate-400 mt-10 pb-6 px-4 leading-relaxed">
        By submitting, you confirm you are authorised to request these tests on behalf of the patient and receive the results.{" "}
        <a href="/terms" className="underline hover:text-slate-600 transition-colors">Terms &amp; Conditions</a>
        {" "}and{" "}
        <a href="/privacy" className="underline hover:text-slate-600 transition-colors">Privacy Policy</a>.
      </p>

      {/* Scan slip lives in the sheet header when the form is on paper */}
      {inModal && headerSlot && step === 2 && createPortal(scanSlipControl, headerSlot)}

      {/* Lab details modal */}
      {labDetailsOpen && displayLab && (
        <LabDetailsModal lab={displayLab} onClose={() => setLabDetailsOpen(false)} />
      )}



      {/* Call modal — shown when lab has multiple phone numbers */}
      {callOpen && displayLab && (
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
            {(() => {
              const _waCheck: string[] = (displayLab.whatsapp
                ? (() => { try { const p = JSON.parse(displayLab.whatsapp); return Array.isArray(p) ? p : [displayLab.whatsapp]; } catch { return [displayLab.whatsapp]; } })()
                : []).filter((wa: string) => wa.replace(/\D/g, "").length >= 7);
              const _hasWa = _waCheck.length > 0;
              return (
                <div className={`bg-gradient-to-br px-5 pt-5 pb-4 flex items-center gap-3 ${_hasWa ? "from-emerald-50 via-white to-sky-50" : "from-medical-50 via-white to-sky-50"}`}>
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${_hasWa ? "bg-emerald-600" : "bg-medical-600"}`}>
                    {_hasWa ? <MessageCircle className="w-5 h-5 text-white" /> : <PhoneCall className="w-5 h-5 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-800 leading-tight truncate">{displayLab.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Get in touch</p>
                  </div>
                  <button
                    onClick={() => setCallOpen(false)}
                    className="p-1.5 rounded-xl hover:bg-white/60 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })()}
            {/* Contact list — WhatsApp first, then phones */}
            <div className="px-4 py-3 space-y-2 pb-5">
              {(() => {
                const waNumbers: string[] = (displayLab.whatsapp
                  ? (() => { try { const p = JSON.parse(displayLab.whatsapp); return Array.isArray(p) ? p : [displayLab.whatsapp]; } catch { return [displayLab.whatsapp]; } })()
                  : []).filter((wa: string) => wa.replace(/\D/g, "").length >= 7);
                const phones = parsePhones(displayLab.phones);
                return (
                  <>
                    {waNumbers.map((num, i) => (
                      <a
                        key={`wa-${i}`}
                        href={`https://wa.me/${num.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setCallOpen(false)}
                        className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 hover:border-emerald-200 text-emerald-800 font-semibold text-sm transition-all group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-emerald-600 group-hover:bg-emerald-700 flex items-center justify-center shrink-0 transition-colors">
                          <MessageCircle className="w-4 h-4 text-white" />
                        </div>
                        <span className="flex-1">{num}</span>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">WhatsApp</span>
                      </a>
                    ))}
                    {phones.map((ph, i) => (
                      <a
                        key={i}
                        href={`tel:${ph.number}`}
                        onClick={() => setCallOpen(false)}
                        className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl bg-medical-50 hover:bg-medical-100 border border-medical-100 hover:border-medical-200 text-medical-800 font-semibold text-sm transition-all group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-medical-600 group-hover:bg-medical-700 flex items-center justify-center shrink-0 transition-colors">
                          <Phone className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          {ph.label && <p className="text-xs text-medical-500 leading-none mb-0.5">{ph.label}</p>}
                          <span>{ph.number}</span>
                        </div>
                        <PhoneCall className="w-4 h-4 text-medical-400 group-hover:text-medical-600 transition-colors" />
                      </a>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
