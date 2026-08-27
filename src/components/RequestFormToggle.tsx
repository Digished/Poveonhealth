"use client";

import { useState } from "react";
import { Stethoscope, User, ChevronDown, Check } from "lucide-react";
import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { PatientRequestForm } from "@/components/PatientRequestForm";
import type { Lab } from "@/lib/types";
import type { PhoneEntry } from "@/lib/phones";

type Mode = "professional" | "patient";

interface RequestFormToggleProps {
  initialLabs?: Lab[];
  /** "modal" = rendered on the lab-branded paper request sheet. */
  chrome?: "page" | "modal";
  /** Which side of the form opens first. */
  initialMode?: "professional" | "patient";
  preselectedLabId?: string;
  preselectedLabName?: string;
  preselectedLabAddress?: string;
  preselectedServiceCategories?: string[];
  preselectedLabPhones?: unknown;
  onModeChange?: (mode: "professional" | "patient") => void;
  locations?: Array<{
    lab_id: string;
    lab_branch_id: string | null;
    name: string;
    address: string;
    phones: PhoneEntry[];
    whatsapp?: string | null;
    logo_url?: string | null;
    is_main: boolean;
    is_parent: boolean;
  }>;
}

export function RequestFormToggle({
  initialLabs,
  preselectedLabId,
  preselectedLabName,
  preselectedLabAddress,
  preselectedServiceCategories,
  preselectedLabPhones,
  onModeChange,
  locations,
  chrome = "page",
  initialMode = "professional",
}: RequestFormToggleProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setDropdownOpen(false);
    onModeChange?.(next);
  };

  const modeLabels = {
    professional: "Medical Professional",
    patient: "Patient",
  };

  const modeIcons = {
    professional: <Stethoscope className="w-4 h-4" />,
    patient: <User className="w-4 h-4" />,
  };

  const modeDescriptions = {
    professional: "Submit requests on behalf of patients",
    patient: "Submit your own health request",
  };

  const forms =
    mode === "professional" ? (
      <DoctorRequestForm
        chrome={chrome}
        initialLabs={initialLabs}
        preselectedLabId={preselectedLabId}
        preselectedLabName={preselectedLabName}
        locations={locations}
      />
    ) : (
      <PatientRequestForm
        chrome={chrome}
        initialLabs={initialLabs}
        preselectedLabId={preselectedLabId}
        preselectedLabName={preselectedLabName}
        preselectedLabAddress={preselectedLabAddress}
        preselectedServiceCategories={preselectedServiceCategories}
        preselectedLabPhones={preselectedLabPhones}
        locations={locations}
      />
    );

  // ── Paper sheet: the first field of the form, "tick one" ────────────────────
  if (chrome === "modal") {
    return (
      <div>
        <div className="px-4 pt-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-stone-500">
            Section A · Who is completing this form
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["professional", "patient"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeChange(m)}
                  aria-pressed={active}
                  className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
                    active
                      ? "border-medical-500/70 bg-white shadow-[0_1px_0_rgba(15,23,42,0.05)]"
                      : "border-stone-300/70 bg-white/40 hover:border-stone-400/70 hover:bg-white/70"
                  }`}
                >
                  <span
                    className={`mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                      active ? "border-medical-600 bg-medical-600 text-white" : "border-stone-400/80 bg-white"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[12.5px] font-semibold leading-tight ${active ? "text-slate-900" : "text-stone-600"}`}>
                      {m === "professional" ? "Referring clinician" : "Patient (self-request)"}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-stone-400">
                      {m === "professional" ? "Requesting for a patient" : "Booking my own tests"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 border-t border-dashed border-stone-300/80" />
        </div>

        {forms}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode dropdown */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between gap-3 px-4 py-4 rounded-2xl border border-stone-200/80 bg-white/70 backdrop-blur-sm hover:bg-white transition-all shadow-[0_1px_3px_rgba(40,33,20,0.05)] focus:outline-none focus:ring-2 focus:ring-medical-400/40 focus:border-medical-300"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-medical-600 flex-shrink-0">
              {modeIcons[mode]}
            </div>
            <div className="text-left min-w-0">
              <p className="text-[11px] font-medium text-stone-400 uppercase tracking-[0.12em]">I am a</p>
              <p className="text-sm font-semibold text-stone-800">{modeLabels[mode]}</p>
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-stone-400 flex-shrink-0 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-sm border border-stone-200/80 rounded-2xl shadow-lg shadow-stone-300/30 z-50 overflow-hidden">
            {(["professional", "patient"] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-l-2 ${
                  mode === m
                    ? "bg-medical-50/70 border-l-medical-500"
                    : "hover:bg-stone-50 border-l-transparent"
                }`}
              >
                <div className={`text-lg flex-shrink-0 ${mode === m ? "text-medical-600" : "text-stone-400"}`}>
                  {modeIcons[m]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${mode === m ? "text-medical-700" : "text-stone-700"}`}>
                    {modeLabels[m]}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    {modeDescriptions[m]}
                  </p>
                </div>
                {mode === m && (
                  <div className="w-1.5 h-1.5 rounded-full bg-medical-500 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* Forms */}
      {forms}
    </div>
  );
}
