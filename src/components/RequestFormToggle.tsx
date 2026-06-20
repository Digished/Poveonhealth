"use client";

import { useState } from "react";
import { Stethoscope, User, ChevronDown } from "lucide-react";
import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { PatientRequestForm } from "@/components/PatientRequestForm";
import type { Lab } from "@/lib/types";
import type { PhoneEntry } from "@/lib/phones";

type Mode = "professional" | "patient";

interface RequestFormToggleProps {
  initialLabs?: Lab[];
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
}: RequestFormToggleProps) {
  const [mode, setMode] = useState<Mode>("professional");
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
      {mode === "professional" ? (
        <DoctorRequestForm
          initialLabs={initialLabs}
          preselectedLabId={preselectedLabId}
          preselectedLabName={preselectedLabName}
          locations={locations}
        />
      ) : (
        <PatientRequestForm
          initialLabs={initialLabs}
          preselectedLabId={preselectedLabId}
          preselectedLabName={preselectedLabName}
          preselectedLabAddress={preselectedLabAddress}
          preselectedServiceCategories={preselectedServiceCategories}
          preselectedLabPhones={preselectedLabPhones}
          locations={locations}
        />
      )}
    </div>
  );
}
