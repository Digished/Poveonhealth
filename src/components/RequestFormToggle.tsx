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
    <div className="space-y-3">
      {/* Mode dropdown */}
      <div className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-500"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-medical-600 flex-shrink-0">
              {modeIcons[mode]}
            </div>
            <div className="text-left min-w-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">I am a</p>
              <p className="text-sm font-bold text-slate-800">{modeLabels[mode]}</p>
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
            {(["professional", "patient"] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-l-4 ${
                  mode === m
                    ? "bg-medical-50 border-l-medical-600"
                    : "hover:bg-slate-50 border-l-transparent hover:border-l-slate-300"
                }`}
              >
                <div className={`text-lg flex-shrink-0 ${mode === m ? "text-medical-600" : "text-slate-400"}`}>
                  {modeIcons[m]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${mode === m ? "text-medical-700" : "text-slate-700"}`}>
                    {modeLabels[m]}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {modeDescriptions[m]}
                  </p>
                </div>
                {mode === m && (
                  <div className="w-2.5 h-2.5 rounded-full bg-medical-600 flex-shrink-0 animate-pulse" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Subtle hint about switching */}
        <p className="text-xs text-slate-400 mt-2 px-1">
          <span className="opacity-60">Can switch anytime</span>
        </p>
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
