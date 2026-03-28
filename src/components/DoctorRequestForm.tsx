"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { HospitalTagInput } from "@/components/ui/HospitalTagInput";
import {
  FlaskConical, User, MapPin, Phone, Stethoscope,
  TestTube2, ChevronRight, ChevronLeft, Building2, Check,
  Search, X, PhoneCall, RefreshCw, ChevronDown, Mail,
  Award, Info, Layers, Pencil, Camera, FileText,
  AlertTriangle, Truck, MessageCircle,
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
import { TestTagInput, TestTag } from "@/components/ui/TestTagInput";
import { smartSplitTestNames } from "@/lib/smart-split";
import { PhoneInput } from "@/components/PhoneInput";
import { BankAccountInput } from "@/components/BankAccountInput";
import { DobInput } from "@/components/DobInput";
import { SuccessScreen } from "@/components/SuccessScreen";
import { PoveonLogo } from "@/components/PoveonLogo";
import { PROFESSIONAL_PREFIXES, PrefixSelectModal, PrefixSelect } from "@/components/PrefixSelect";
import type { Lab, CreateRequestResponse } from "@/lib/types";

// Module-level session cache — labs rarely change; reuse across form mounts
// without re-fetching for the lifetime of the browser tab.
let _labsCache: Lab[] | null = null;

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
  diagnosis: string;
  tests?: string; // used only for error state; rendered via TestTagInput
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
  diagnosis: "",
};




const STEPS = [
  { title: "Location", icon: Building2 },
  { title: "Clinical", icon: TestTube2 },
  { title: "Referral", icon: Stethoscope },
  { title: "Patient", icon: User },
];


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
      <label className="text-sm font-medium text-slate-700">
        Destination Laboratory <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5 align-middle" aria-label="required" />
      </label>
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
            const phones = (lab.phones as string[] | null) ?? [];
            const waNumbers: string[] = lab.whatsapp
              ? (() => { try { const p = JSON.parse(lab.whatsapp); return Array.isArray(p) ? p : [lab.whatsapp]; } catch { return [lab.whatsapp]; } })()
              : [];
            const hasContact = phones.length > 0 || waNumbers.filter(Boolean).length > 0;
            return hasContact ? (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Contact</p>
                <div className="flex flex-col gap-2">
                  {phones.map((ph, i) => (
                    <a key={i} href={`tel:${ph}`}
                      className="flex items-center gap-2 text-sm text-medical-700 font-medium hover:text-medical-900 transition-colors">
                      <div className="w-7 h-7 rounded-lg bg-medical-50 flex items-center justify-center shrink-0">
                        <Phone className="w-3.5 h-3.5 text-medical-500" />
                      </div>
                      {ph}
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
  phones: string[];
  whatsapp?: string | null;
  logo_url?: string | null;
  is_main: boolean;    // true = this branch is the highlighted/default one
  is_parent: boolean;  // true = this entry is the root/parent lab
}

export function DoctorRequestForm({
  preselectedLabId,
  preselectedLabName,
  locations = [],
  initialLabs,
}: {
  preselectedLabId?: string;
  preselectedLabName?: string;
  locations?: Location[];
  initialLabs?: Lab[];
} = {}) {
  // Seed module-level cache from SSR-provided data so first open is instant
  if (initialLabs && !_labsCache) { _labsCache = initialLabs; }
  const labPreselected = !!preselectedLabId;
  // hasLocations = true when there are multiple locations to choose from (parent + at least 1 branch)
  const hasLocations = locations.length > 1;
  // Default to the is_main branch if one exists, otherwise the parent (index 0)
  const defaultLocIdx = locations.length > 0 ? Math.max(0, locations.findIndex((l) => l.is_main)) : 0;
  const startStep = !labPreselected ? 1 : hasLocations ? 1 : 2;
  const [step, setStep] = useState(startStep);
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
  const [bankCode, setBankCode] = useState("");
  const [bankVerified, setBankVerified] = useState(false);
  const [maxStep, setMaxStep] = useState(startStep);
  const [clinicalMode, setClinicalMode] = useState<"type" | "picture">("type");
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
    patient_name: string; dob: string; sex: string;
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
  // Step 2 diagnosis collapsible
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  // Step 4 accordion / lookup states
  const [patientInfoOpen, setPatientInfoOpen] = useState(false);
  const [patientLookupStatus, setPatientLookupStatus] = useState<"idle" | "checking" | "found" | "not_found">("idle");
  // Track what was auto-filled by the last email lookup so we can clear it when email changes
  const emailAutofillRef = useRef<{ email: string; phone: string; name: string; dob: string; sex: string }>({ email: "", phone: "", name: "", dob: "", sex: "" });
  // Always-fresh read of form state for use inside async callbacks
  const formRef = useRef(form);
  formRef.current = form;

  // Step 3: doctor profile check
  const [docProfileStatus, setDocProfileStatus] = useState<"idle" | "checking" | "found_complete" | "found_partial" | "not_found">("idle");
  const [docProfileInfo, setDocProfileInfo] = useState<{ prefix: string | null; full_name: string | null; hospital: string | null; has_bank: boolean } | null>(null);
  // Sub-step for collecting doctor details inline when profile is incomplete (1=name, 2=hospital, 3=bank)
  const [docSubStep, setDocSubStep] = useState<1 | 2 | 3 | null>(null);
  // Track which fields were auto-filled from a doctor profile lookup so we can clear them on email change
  const docAutofillRef = useRef<{ email: string; prefix: string; name: string; hospital: string }>({ email: "", prefix: "", name: "", hospital: "" });

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
            if (data.dob && !form.dob) set("dob", data.dob);
            if (data.sex && !form.sex) set("sex", data.sex);
          }
        })
        .catch(() => null);
    }, 700);
    return () => { clearTimeout(timer); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.patient_phone]);

  // Auto-fill patient details from profile when email is entered (Step 4)
  useEffect(() => {
    const email = form.patient_email;

    // When email changes, clear any fields that were filled by the previous lookup
    const prev = emailAutofillRef.current;
    if (prev.email !== email) {
      if (prev.phone) set("patient_phone", "");
      if (prev.name) set("patient_name", "");
      if (prev.dob) set("dob", "");
      if (prev.sex) set("sex", "");
      emailAutofillRef.current = { email, phone: "", name: "", dob: "", sex: "" };
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setPatientLookupStatus("idle");
      return;
    }
    setPatientLookupStatus("checking");
    const timer = setTimeout(() => {
      fetch(`/api/patient/profile?email=${encodeURIComponent(email)}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.success) {
            setPatientLookupStatus("found");
            const f = formRef.current;
            const written = { email, phone: "", name: "", dob: "", sex: "" };
            if (data.phone && !f.patient_phone) { set("patient_phone", data.phone); written.phone = data.phone; }
            if (data.name && !f.patient_name) { set("patient_name", data.name); written.name = data.name; setPatientInfoOpen(true); }
            if (data.dob && !f.dob) { set("dob", data.dob); written.dob = data.dob; }
            if (data.sex && !f.sex) { set("sex", data.sex); written.sex = data.sex; }
            emailAutofillRef.current = written;
          } else {
            setPatientLookupStatus("not_found");
          }
        })
        .catch(() => setPatientLookupStatus("not_found"));
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.patient_email]);

  // Step 3: debounced doctor email profile check
  useEffect(() => {
    const email = form.doctor_email.trim();

    // When the email changes, clear any fields that were auto-filled from the previous profile
    const prev = docAutofillRef.current;
    if (prev.email !== email) {
      setForm((f) => ({
        ...f,
        doctor_prefix: f.doctor_prefix === prev.prefix ? "" : f.doctor_prefix,
        doctor_name: f.doctor_name === prev.name ? "" : f.doctor_name,
        doctor_hospital: f.doctor_hospital === prev.hospital ? "" : f.doctor_hospital,
      }));
      docAutofillRef.current = { email, prefix: "", name: "", hospital: "" };
    }

    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      setDocProfileStatus("idle");
      setDocProfileInfo(null);
      setDocSubStep(null);
      return;
    }
    setDocProfileStatus("checking");
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/doc-profile/check?email=${encodeURIComponent(email)}`, { signal: controller.signal })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (!data) { setDocProfileStatus("not_found"); setDocSubStep(1); return; }
          if (data.exists) {
            const info = { prefix: data.prefix, full_name: data.full_name, hospital: data.hospital, has_bank: !!data.has_bank };
            setDocProfileInfo(info);
            if (data.profile_complete) {
              setDocProfileStatus("found_complete");
              setDocSubStep(null);
              // Auto-fill form fields from the live profile and record what was filled
              const filled = { email, prefix: data.prefix ?? "", name: data.full_name ?? "", hospital: data.hospital ?? "" };
              docAutofillRef.current = filled;
              setForm((prev) => ({
                ...prev,
                doctor_prefix: data.prefix ?? prev.doctor_prefix,
                doctor_name: data.full_name ?? prev.doctor_name,
                doctor_hospital: data.hospital ?? prev.doctor_hospital,
              }));
            } else {
              setDocProfileStatus("found_partial");
              setDocSubStep(1);
            }
          } else {
            setDocProfileInfo(null);
            setDocProfileStatus("not_found");
            setDocSubStep(1);
          }
        })
        .catch(() => { setDocProfileStatus("not_found"); setDocSubStep(1); });
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [form.doctor_email]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchLabs = useCallback(() => {
    // Lab-specific pages never show the search — skip entirely
    if (labPreselected) return;
    // Return cached data instantly if already fetched this session
    if (_labsCache) { setLabs(_labsCache); setLabsLoading(false); return; }
    setLabsLoading(true);
    fetch("/api/labs")
      .then((r) => r.json())
      .then((data) => {
        _labsCache = data.labs ?? [];
        setLabs(_labsCache!);
      })
      .catch(() => toast.error("Failed to load laboratories"))
      .finally(() => setLabsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labPreselected]);

  // Idle prefetch — if labs aren't already cached (no SSR data), warm the cache
  // while the browser is idle so the modal feels instant even without server preload.
  useEffect(() => {
    if (labPreselected || _labsCache) return;
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

  // Load saved referrer email from localStorage (pre-fills Step 3)
  function loadSavedProfile() {
    try {
      const raw = localStorage.getItem(DOCTOR_STORAGE_KEY);
      if (raw) {
        const profile = JSON.parse(raw) as { email?: string; prefix?: string; name?: string };
        if (profile.email) {
          setSavedProfile(profile as { prefix: string; name: string; email: string; phone: string; hospital: string; bankName: string; bankCode: string; accountNumber: string; accountName: string });
          setForm((prev) => ({ ...prev, doctor_email: profile.email || "" }));
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
      if (clinicalMode === "type") {
        if (testTags.length === 0) errs.tests = "Required";
        // diagnosis is optional
      }
      if (clinicalMode === "picture") {
        if (!testImageUrl) {
          setImageUploadError("Please upload a test request image");
        }
        // tests and diagnosis are optional for picture mode
      }
    }
    if (s === 3) {
      if (!form.doctor_email.trim()) errs.doctor_email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.doctor_email))
        errs.doctor_email = "Invalid email address";
    }
    if (s === 4) {
      if (!form.patient_email.trim()) errs.patient_email = "Patient email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email))
        errs.patient_email = "Invalid email";
      if (!form.patient_phone) errs.patient_phone = "Phone number is required";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function persistDoctorProfile() {
    try {
      // Only save email — all other profile data lives in the dashboard
      localStorage.setItem(DOCTOR_STORAGE_KEY, JSON.stringify({ email: form.doctor_email }));
    } catch { /* ignore storage errors */ }
  }

  function handleNext() {
    if (validateStep(step)) {
      if (step === 3) persistDoctorProfile();
      const next = Math.min(4, step + 1);
      setStep(next);
      setMaxStep((m) => Math.max(m, next));
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
    if (!validateStep(4)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tests: clinicalMode === "picture" ? (testsString || "See attached image") : testsString,
          test_image_url: testImageUrl ?? undefined,
          is_critical: isCritical,
          needs_ambulance: needsAmbulance,
          ambulance_notes: ambulanceNotes || undefined,
        }),
      });
      const data: CreateRequestResponse = await res.json();
      if (data.success) {
        setProgress(100);
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
        onReset={() => {
          setResult(null);
          setForm({ ...INITIAL, lab_id: locations.length > 0 ? locations[defaultLocIdx].lab_id : (preselectedLabId ?? "") });
          setTestTags([]);
          setStep(startStep);
          setMaxStep(startStep);
          setSelectedLocIdx(defaultLocIdx);
          setClinicalMode("type");
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

  const selectedLab = labs.find((l) => l.id === form.lab_id);

  // When preselected with locations, the "effective lab" for display is the selected location.
  // We synthesise a minimal Lab-shaped object so the header/call modal/details modal always
  // show the correct contact info (branch's own phones, address, etc.)
  const selectedLocation = labPreselected && locations.length > 0 ? locations[selectedLocIdx] : null;
  const displayLab: Lab | null = selectedLab ?? (selectedLocation ? ({
    id: selectedLocation.lab_id,
    name: selectedLocation.name,
    address: selectedLocation.address,
    phones: selectedLocation.phones as unknown as string[],
    whatsapp: selectedLocation.whatsapp ?? null,
    logo_url: selectedLocation.logo_url ?? null,
    description: "",
    service_categories: [],
    certifications: [],
    email: "",
    prefix: "",
    slug: null,
    hidden: false,
    notification_email: null,
    request_email: null,
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
      if (clinicalMode === "picture") return !!testImageUrl;
      return testTags.length > 0;
    }
    if (step === 3) {
      return (
        form.doctor_email.trim().length > 0 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.doctor_email)
      );
    }
    if (step === 4) {
      const emailOk = !!form.patient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email);
      return emailOk && !!form.patient_phone;
    }
    return true;
  })();

  // Whether the clinical section of step 2 is done (drives the connector line)
  const clinicalDone =
    (clinicalMode === "picture" && !!testImageUrl) ||
    (clinicalMode === "type" && testTags.length > 0);

  return (
    <div className="animate-fade-in">
      {/* Sticky header + step indicator */}
      <div className={`sticky top-0 z-10 -mx-4 px-4 transition-all duration-300 ${scrolled ? "pt-2 pb-2" : "pt-3 pb-3"}`}>
        {/* Full-width frosted background */}
        <div className="absolute inset-0 left-1/2 -translate-x-1/2 w-screen bg-white/80 backdrop-blur-md border-b border-white/60 -z-10" />

        {/* Lab info / branding */}
        <div className="mb-3">
            {displayLab ? (() => {
              const phones = (displayLab.phones as string[] | null) ?? [];
              const waNumbers: string[] = displayLab.whatsapp
                ? (() => { try { const p = JSON.parse(displayLab.whatsapp!); return Array.isArray(p) ? p : [displayLab.whatsapp!]; } catch { return [displayLab.whatsapp!]; } })()
                : [];
              const hasWa = waNumbers.filter(Boolean).length > 0;
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
                            href={`tel:${phones[0]}`}
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
      </div>

      {/* Step content */}
      <div
        className="glass-card p-4 mt-3 mb-2"
      >

        {/* Step 1: Choose Lab / Branch */}
        {step === 1 && (
          <div className="space-y-5">
            {/* Generic URL: lab search — unchanged */}
            {!labPreselected && (
              <>
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
                  onOpen={fetchLabs}
                  onRefresh={fetchLabs}
                />
                {selectedLab && (
                  <div className="rounded-2xl border border-medical-100 overflow-hidden">
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
              </>
            )}

            {/* Lab-specific URL with locations: location selection */}
            {labPreselected && hasLocations && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
                  <MapPin className="w-4 h-4 text-medical-600" />
                  Select Location
                </h2>
                <p className="text-sm text-slate-500">Choose the {preselectedLabName} location you are sending this request to.</p>
                <div className="space-y-3">
                  {locations.map((loc, idx) => {
                    const selected = selectedLocIdx === idx;
                    return (
                      <button
                        key={loc.lab_id + idx}
                        type="button"
                        onClick={() => selectLocation(idx)}
                        className={`w-full flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                          selected
                            ? "border-medical-400 bg-medical-50 ring-2 ring-medical-200"
                            : "border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selected ? "border-medical-500 bg-medical-500" : "border-slate-300"}`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold leading-tight ${selected ? "text-medical-800" : "text-slate-700"}`}>
                            {loc.name}
                            {loc.is_parent && <span className="ml-2 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">Main Lab</span>}
                            {!loc.is_parent && loc.is_main && <span className="ml-2 text-xs bg-medical-100 text-medical-700 px-2 py-0.5 rounded-full font-medium">Main Branch</span>}
                          </p>
                          {loc.address && (
                            <p className="text-xs text-slate-400 flex items-start gap-1 mt-1">
                              <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                              {loc.address}
                            </p>
                          )}
                          {loc.phones.length > 0 && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 shrink-0" />
                              {loc.phones[0]}{loc.phones.length > 1 ? ` +${loc.phones.length - 1} more` : ""}
                            </p>
                          )}
                          {loc.whatsapp && (() => {
                            let waNumbers: string[] = [];
                            try { const p = JSON.parse(loc.whatsapp); waNumbers = Array.isArray(p) ? p.filter(Boolean) : [loc.whatsapp]; } catch { waNumbers = [loc.whatsapp]; }
                            return waNumbers.map((num, i) => (
                              <p key={i} className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                {num}
                              </p>
                            ));
                          })()}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {errors.lab_id && <p className="text-xs text-red-600 font-medium">{errors.lab_id}</p>}
              </div>
            )}

            {/* Lab-specific URL, no locations: lab confirmation */}
            {labPreselected && !hasLocations && (
              <div className="space-y-4">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
                  <Building2 className="w-4 h-4 text-medical-600" />
                  Submit a Lab Request
                </h2>
                <div className="rounded-2xl border border-medical-100 bg-medical-50/40 px-5 py-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{preselectedLabName}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    You are about to send a lab test request directly to this laboratory. Fill in the required details and your request will be delivered instantly.
                  </p>
                </div>
                <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                  <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-sky-800 leading-relaxed">
                    Fill in the clinical tests, your email, and the patient's contact details — the request will be delivered to the lab instantly.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Clinical Details */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <TestTube2 className="w-4 h-4 text-medical-600" />
              Clinical Details
            </h2>

            <div className="space-y-3">
                  {/* Mode toggle */}
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setClinicalMode("type")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
                        clinicalMode === "type" ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <Stethoscope className="w-4 h-4" />
                      Type
                    </button>
                    <button
                      type="button"
                      onClick={() => setClinicalMode("picture")}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
                        clinicalMode === "picture" ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      <Camera className="w-4 h-4" />
                      Upload
                    </button>
                  </div>

                  {/* Type mode: tests (required) + diagnosis (optional, collapsible) */}
                  {clinicalMode === "type" && (
                    <div className="space-y-4 animate-fade-in-up">
                      <TestTagInput
                        label="Laboratory Tests Requested"
                        value={testTags}
                        onChange={setTestTags}
                        labId={form.lab_id}
                        error={errors.tests}
                      />
                      {/* Optional collapsible diagnosis */}
                      <div className={`rounded-xl border-2 overflow-hidden transition-colors ${form.diagnosis.trim() ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200"}`}>
                        <button
                          type="button"
                          onClick={() => setDiagnosisOpen((v) => !v)}
                          className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${form.diagnosis.trim() ? "hover:bg-emerald-50/50" : "hover:bg-slate-50 bg-slate-50/50"}`}
                        >
                          <div className="flex items-center gap-2 text-left">
                            {form.diagnosis.trim()
                              ? <><Check className="w-4 h-4 text-emerald-500 shrink-0" /><span className="text-sm font-semibold text-slate-700">Diagnosis / Clinical Notes added</span></>
                              : <><FileText className="w-4 h-4 text-slate-400 shrink-0" /><span className="text-sm font-semibold text-slate-700">Diagnosis / Clinical Notes</span></>
                            }
                          </div>
                          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${form.diagnosis.trim() ? "text-emerald-500" : "text-slate-400"} ${diagnosisOpen ? "rotate-180" : ""}`} />
                        </button>
                        {diagnosisOpen && (
                          <div className={`px-4 pb-4 pt-2 border-t ${form.diagnosis.trim() ? "border-emerald-100 bg-emerald-50/20" : "border-slate-100"}`}>
                            <Textarea
                              label=""
                              placeholder="Brief clinical summary or working diagnosis…"
                              rows={3}
                              value={form.diagnosis}
                              onChange={(e) => set("diagnosis", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Picture mode: image upload */}
                  {clinicalMode === "picture" && (
                    <div className="space-y-3 animate-fade-in-up">
                      <p className="text-sm text-slate-500">Upload a photo of a filled physical test request and watch the magic happen.</p>
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
                          <div className="space-y-2">
                            {/* Image thumbnail row */}
                            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3">
                              <img src={testImageUrl} alt="Uploaded test request slip" className="w-14 h-14 rounded-lg object-cover border border-emerald-200 shrink-0" />
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
                              <button type="button" onClick={() => { setTestImageUrl(null); setImageUploadError(null); setExtractionResult(null); setExtractionDismissed(false); }} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-400 hover:text-emerald-700 transition-colors shrink-0" aria-label="Remove uploaded image">
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Show only if AI flagged uncertain items — otherwise the filled fields speak for themselves */}
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
                        ) : (
                          <label className="cursor-pointer">
                            <div className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 transition-colors text-center ${imageUploadError ? "border-red-300 bg-red-50/30" : "border-slate-200 bg-slate-50/50 hover:border-medical-300 hover:bg-medical-50/30"}`}>
                              <FlaskConical className="w-8 h-8 text-slate-300" />
                              <div>
                                <p className="text-sm font-medium text-slate-600">Tap to upload test request slip</p>
                                <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, WebP, HEIC — max 10 MB</p>
                              </div>
                            </div>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic,.heic"
                              className="sr-only"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                // Client-side validation
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
                                      // Kick off AI extraction immediately
                                      setImageExtracting(true);
                                      setExtractionResult(null);
                                      setExtractionDismissed(false);
                                      fetch("/api/requests/extract-from-image", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ imageUrl: data.url }),
                                      })
                                        .then((r) => r.json())
                                        .then((res) => {
                                          if (res.success && res.extracted) {
                                            setExtractionResult(res.extracted);
                                            // Auto-fill tests & diagnosis immediately
                                            if (Array.isArray(res.extracted.tests) && res.extracted.tests.length > 0) {
                                              // Smart-split each AI-extracted name (handles "CT scan of leg, back and hand")
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
                                              // Background catalog verification — upgrade exact matches to catalog pills
                                              const labId = form.lab_id;
                                              Promise.allSettled(
                                                initialTags.map((tag: { name: string; catalog_test_id: string | null; low_confidence: boolean }) =>
                                                  fetch(`/api/catalog/search?q=${encodeURIComponent(tag.name)}${labId ? `&lab_id=${encodeURIComponent(labId)}` : ""}&limit=1`)
                                                    .then((r) => r.json())
                                                    .then((d) => {
                                                      const match = d.results?.[0];
                                                      if (!match) return null;
                                                      // Accept if canonical name matches (case-insensitive) OR the query name is included in the canonical
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
                                              // Only fill patient/doctor fields if currently empty
                                              patient_name: prev.patient_name || res.extracted.patient_name,
                                              dob: prev.dob || res.extracted.dob,
                                              sex: prev.sex || res.extracted.sex,
                                              doctor_name: prev.doctor_name || res.extracted.doctor_name,
                                              doctor_prefix: prev.doctor_prefix || res.extracted.doctor_prefix,
                                            }));
                                          }
                                        })
                                        .catch(() => { /* silent — user continues manually */ })
                                        .finally(() => {
                                          // Complete progress to 100%, then pause so the user sees all steps done before the card closes
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
                        )}
                        {imageUploadError && <p className="text-xs text-red-600 font-medium">{imageUploadError}</p>}

                        {/* Editable review area — shown after extraction so doctor can confirm/correct */}
                        {testImageUrl && !imageUploading && (
                          <div className="space-y-3 pt-1">
                            <TestTagInput
                              label={imageExtracting ? "Tests Requested (scanning…)" : "Tests Requested"}
                              value={testTags}
                              onChange={setTestTags}
                              labId={form.lab_id}
                              error={errors.tests}
                              disabled={imageExtracting}
                            />
                            <Textarea
                              label="Diagnosis / Clinical Notes"
                              placeholder={imageExtracting ? "Extracting…" : "Extracted from slip, or add manually"}
                              rows={2}
                              value={form.diagnosis}
                              onChange={(e) => set("diagnosis", e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}
              </div>

            {/* Patient Condition — optional */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                Patient Condition
              </p>
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setIsCritical((v) => !v)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
                    isCritical ? "bg-white shadow text-red-600" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Critical
                </button>
                <button
                  type="button"
                  onClick={() => setNeedsAmbulance((v) => !v)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
                    needsAmbulance ? "bg-white shadow text-orange-600" : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  Ambulance
                </button>
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
          </div>
        )}

        {/* Step 3: Referring Professional */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <Stethoscope className="w-4 h-4 text-medical-600" />
              Referral
            </h2>

            {/* Email */}
            <div className="space-y-1">
              <Input
                label="Your Email"
                type="email"
                required
                placeholder="you@hospital.com"
                value={form.doctor_email}
                onChange={(e) => set("doctor_email", e.target.value)}
                error={errors.doctor_email}
              />
              {savedProfile && form.doctor_email && (
                <div className="flex items-center justify-between pt-0.5">
                  <p className="text-xs text-slate-400">Saved email</p>
                  <button type="button" onClick={clearDoctorProfile} className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2">Clear</button>
                </div>
              )}
            </div>

            {/* Checking spinner */}
            {docProfileStatus === "checking" && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <RefreshCw className="w-3 h-3 animate-spin" />Checking…
              </div>
            )}

            {/* ── Profile found & complete — read-only summary ── */}
            {docProfileStatus === "found_complete" && docProfileInfo && (
              <div className="space-y-2">
                {/* Name row */}
                <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {[docProfileInfo.prefix, docProfileInfo.full_name].filter(Boolean).join(" ")}
                    </p>
                    {docProfileInfo.hospital && (
                      <p className="text-xs text-slate-500 truncate">{docProfileInfo.hospital}</p>
                    )}
                  </div>
                </div>
                {/* Bank status */}
                <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border text-xs ${docProfileInfo.has_bank ? "bg-slate-50 border-slate-200 text-slate-600" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  {docProfileInfo.has_bank
                    ? <><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />Bank account on file</>
                    : <><Info className="w-3.5 h-3.5 shrink-0" />Bank details not set — add them in your <a href="/doc-login" className="underline font-medium">dashboard</a></>
                  }
                </div>
              </div>
            )}

            {/* ── Account creation nudge (not_found only) ── */}
            {docProfileStatus === "not_found" && docSubStep !== null && (
              <a
                href="/doc-login"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-medical-50 border border-medical-200 hover:bg-medical-100 transition-colors group mb-3"
              >
                <p className="text-xs text-medical-700 leading-snug">
                  <span className="font-semibold">Save your details permanently</span> — sign in or create a free account
                </p>
                <span className="text-medical-500 text-xs font-semibold shrink-0 group-hover:underline">Sign in →</span>
              </a>
            )}

            {/* ── Profile incomplete / new — inline substeps ── */}
            {(docProfileStatus === "found_partial" || docProfileStatus === "not_found") && docSubStep !== null && (
              <div className="relative pt-1 space-y-0">
                {/* Substep 1: Name */}
                <div className="relative flex gap-3">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      form.doctor_name.trim() ? "bg-emerald-500 border-emerald-500 text-white" : docSubStep === 1 ? "bg-white border-medical-400 text-medical-600" : "bg-white border-slate-200 text-slate-400"
                    }`}>
                      {form.doctor_name.trim() ? <Check className="w-3.5 h-3.5" /> : "1"}
                    </div>
                    <div className="w-px flex-1 bg-slate-200 my-1" />
                  </div>
                  <div className="flex-1 pb-5">
                    <p className="text-xs font-semibold text-slate-600 mb-2">Your name</p>
                    {docSubStep === 1 ? (
                      <div className="space-y-2">
                        <PrefixSelect
                          value={form.doctor_prefix}
                          onChange={(v) => set("doctor_prefix", v)}
                          label=""
                        />
                        <Input
                          placeholder="Full name"
                          value={form.doctor_name}
                          onChange={(e) => set("doctor_name", e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={!form.doctor_name.trim()}
                          onClick={() => setDocSubStep(2)}
                          className="w-full py-2 rounded-xl bg-medical-600 disabled:opacity-40 text-white text-sm font-semibold transition-colors hover:bg-medical-500"
                        >
                          Continue
                        </button>
                      </div>
                    ) : form.doctor_name.trim() ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-700">{[form.doctor_prefix, form.doctor_name].filter(Boolean).join(" ")}</p>
                        <button type="button" onClick={() => setDocSubStep(1)} className="text-xs text-medical-500 underline">Edit</button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Substep 2: Hospital */}
                <div className="relative flex gap-3">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      form.doctor_hospital.trim() ? "bg-emerald-500 border-emerald-500 text-white" : docSubStep === 2 ? "bg-white border-medical-400 text-medical-600" : "bg-white border-slate-200 text-slate-400"
                    }`}>
                      {form.doctor_hospital.trim() ? <Check className="w-3.5 h-3.5" /> : "2"}
                    </div>
                    <div className="w-px flex-1 bg-slate-200 my-1" />
                  </div>
                  <div className="flex-1 pb-5">
                    <p className="text-xs font-semibold text-slate-600 mb-2">Hospital / clinic <span className="font-normal text-slate-400">(optional)</span></p>
                    {docSubStep === 2 ? (
                      <div className="space-y-2">
                        <HospitalTagInput
                          value={form.doctor_hospital ? [form.doctor_hospital] : []}
                          onChange={(names) => set("doctor_hospital", names[names.length - 1] ?? "")}
                          max={1}
                        />
                        <button
                          type="button"
                          onClick={() => setDocSubStep(3)}
                          className="w-full py-2 rounded-xl bg-medical-600 text-white text-sm font-semibold transition-colors hover:bg-medical-500"
                        >
                          Continue
                        </button>
                      </div>
                    ) : form.doctor_hospital.trim() ? (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-slate-700">{form.doctor_hospital}</p>
                        <button type="button" onClick={() => setDocSubStep(2)} className="text-xs text-medical-500 underline">Edit</button>
                      </div>
                    ) : docSubStep !== null && docSubStep > 2 ? (
                      <button type="button" onClick={() => setDocSubStep(2)} className="text-xs text-slate-400 underline">Add hospital</button>
                    ) : null}
                  </div>
                </div>

                {/* Substep 3: Bank (optional) */}
                <div className="relative flex gap-3">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      form.doctor_bank_name.trim() ? "bg-emerald-500 border-emerald-500 text-white" : docSubStep === 3 ? "bg-white border-amber-400 text-amber-600" : "bg-white border-slate-200 text-slate-400"
                    }`}>
                      {form.doctor_bank_name.trim() ? <Check className="w-3.5 h-3.5" /> : "3"}
                    </div>
                  </div>
                  <div className="flex-1 pb-2">
                    <p className="text-xs font-semibold text-slate-600 mb-2">Bank details <span className="font-normal text-amber-500">optional</span></p>
                    {docSubStep === 3 ? (
                      <div className="space-y-3">
                        <BankAccountInput
                          bankName={form.doctor_bank_name}
                          bankCode={bankCode}
                          accountNumber={form.doctor_account_number}
                          accountName={form.doctor_account_name}
                          onBankChange={(name, code) => { set("doctor_bank_name", name); setBankCode(code); }}
                          onAccountNumberChange={(v) => set("doctor_account_number", v)}
                          onAccountNameChange={(v) => set("doctor_account_name", v)}
                          onVerifiedChange={(v) => setBankVerified(v)}
                        />
                        <div className="flex gap-2 pt-1">
                          <button type="button" onClick={() => { set("doctor_bank_name", ""); set("doctor_account_number", ""); set("doctor_account_name", ""); setBankCode(""); setBankVerified(false); setDocSubStep(null); }} className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium">Skip</button>
                          <button type="button" disabled={!!form.doctor_account_number && !bankVerified} onClick={() => setDocSubStep(null)} className="flex-1 py-2 rounded-xl bg-amber-500 disabled:opacity-40 text-white text-sm font-semibold">Save</button>
                        </div>
                      </div>
                    ) : form.doctor_bank_name.trim() ? (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-700 truncate">{form.doctor_bank_name}</p>
                          {form.doctor_account_name && (
                            <p className="text-xs text-slate-500 truncate">{form.doctor_account_name} · ****{form.doctor_account_number.slice(-4)}</p>
                          )}
                        </div>
                        <button type="button" onClick={() => setDocSubStep(3)} className="text-xs text-medical-500 underline shrink-0 ml-2">Edit</button>
                      </div>
                    ) : docSubStep === null ? (
                      <p className="text-xs text-slate-400">Not set</p>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Patient Contact + Details + Review */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="flex items-center gap-3 text-base font-bold text-slate-800 pb-4 border-b border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-medical-50 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-medical-600" />
              </div>
              Patient Contact
            </h2>

            <div className="relative pt-1">
              {/* Substep 1: Email */}
              <div className="relative flex gap-3">
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                    form.patient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email)
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "bg-white border-medical-400 text-medical-600"
                  }`}>
                    {form.patient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email)
                      ? <Check className="w-3.5 h-3.5" />
                      : "1"}
                  </div>
                  {form.patient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email) && (
                    <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-3 min-w-0 space-y-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="patient_email" className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                      Patient Email
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" aria-label="required" />
                    </label>
                    <Input
                      id="patient_email"
                      type="email"
                      placeholder="patient@example.com"
                      hint="Used to send the request code, track results, and auto-fill patient details"
                      value={form.patient_email}
                      onChange={(e) => set("patient_email", e.target.value)}
                      error={errors.patient_email}
                    />
                  </div>
                  {/* Profile lookup feedback */}
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
                      <span className="text-slate-600">No existing profile — please fill in details below</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Substep 2: Phone — reveals after email is valid */}
              {form.patient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email) && (
                <div className="relative flex gap-3 animate-fade-in-up">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      form.patient_phone.trim()
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-medical-400 text-medical-600"
                    }`}>
                      {form.patient_phone.trim() ? <Check className="w-3.5 h-3.5" /> : "2"}
                    </div>
                    {form.patient_phone.trim() && <div className="w-0.5 flex-1 min-h-4 bg-slate-200 mt-1" />}
                  </div>
                  <div className="flex-1 pb-3 min-w-0">
                    <PhoneInput
                      label="Patient Phone"
                      required
                      value={form.patient_phone}
                      onChange={(v) => set("patient_phone", v)}
                      error={errors.patient_phone}
                    />
                  </div>
                </div>
              )}

              {/* Substep 3: Optional patient details — reveals after phone */}
              {form.patient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email) && form.patient_phone.trim() && (
                <div className="relative flex gap-3 animate-fade-in-up">
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all shrink-0 ${
                      (form.patient_name || form.dob || form.sex)
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "bg-white border-slate-300 text-slate-400"
                    }`}>
                      {(form.patient_name || form.dob || form.sex) ? <Check className="w-3.5 h-3.5" /> : "3"}
                    </div>
                  </div>
                  <div className="flex-1 pb-2 min-w-0">
                    <p className="text-sm font-medium text-slate-700 mb-3">
                      Patient Details
                    </p>
                    <div className="space-y-3">
                      <Input
                        label="Full Name"
                        placeholder="e.g. Amara Okonkwo"
                        value={form.patient_name}
                        onChange={(e) => set("patient_name", e.target.value)}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <DobInput value={form.dob} onChange={(iso) => set("dob", iso)} />
                        <div className="flex flex-col gap-1">
                          <label className="text-sm font-medium text-slate-700">Sex</label>
                          <div className="flex gap-2">
                            {(["male", "female"] as const).map((s) => (
                              <button key={s} type="button" onClick={() => set("sex", form.sex === s ? "" : s)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-semibold ${form.sex === s ? "border-medical-400 bg-medical-50 text-medical-700" : "border-slate-200 bg-white/60 text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}>
                                {s === "male" ? <MarsIcon className={`w-4 h-4 ${form.sex === s ? "text-medical-500" : "text-slate-400"}`} /> : <VenusIcon className={`w-4 h-4 ${form.sex === s ? "text-medical-500" : "text-slate-400"}`} />}
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

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
                    {form.dob && <p className="text-xs text-slate-400 mt-0.5">DOB {form.dob.split("-").reverse().join(" / ")}{form.sex ? ` · ${form.sex}` : ""}</p>}
                  </div>
                </div>
                {/* Clinical */}
                <div className="px-4 py-3.5 flex items-start justify-between gap-4">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide shrink-0 w-20 pt-px">Clinical</p>
                  <div className="text-right min-w-0">
                    {clinicalMode === "picture"
                      ? <p className="text-sm font-semibold text-slate-800">{testImageUrl ? "Image attached" : "No image"}</p>
                      : <>
                          {form.diagnosis && <p className="text-xs text-slate-500 truncate mb-0.5">{form.diagnosis}</p>}
                          <p className="text-sm font-semibold text-slate-800 truncate">{testsString}</p>
                        </>
                    }
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
      </div>

      {/* Back button — inline */}
      {step > 1 && (
        <div className="mt-4">
          <Button variant="ghost" onClick={handleBack} type="button" className="shrink-0">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
      )}

      {/* FAB — Next / Submit — fixed bottom-right, appears when step is valid */}
      {stepValid && (
        <div className="fixed bottom-6 right-5 z-50">
          {step < 4 ? (
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

      <p className="text-center text-xs text-slate-400 mt-4 leading-relaxed">
        By submitting, you confirm you are authorised to request these tests on behalf of the patient and receive the results.{" "}
        <a href="/terms" className="underline hover:text-slate-600 transition-colors">Terms &amp; Conditions</a>
        {" "}and{" "}
        <a href="/privacy" className="underline hover:text-slate-600 transition-colors">Privacy Policy</a>.
      </p>

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
              const _waCheck: string[] = displayLab.whatsapp
                ? (() => { try { const p = JSON.parse(displayLab.whatsapp); return Array.isArray(p) ? p : [displayLab.whatsapp]; } catch { return [displayLab.whatsapp]; } })()
                : [];
              const _hasWa = _waCheck.filter(Boolean).length > 0;
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
                const waNumbers: string[] = displayLab.whatsapp
                  ? (() => { try { const p = JSON.parse(displayLab.whatsapp); return Array.isArray(p) ? p : [displayLab.whatsapp]; } catch { return [displayLab.whatsapp]; } })()
                  : [];
                const phones = (displayLab.phones as string[] | null) ?? [];
                return (
                  <>
                    {waNumbers.filter(Boolean).map((num, i) => (
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
