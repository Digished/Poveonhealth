"use client";

import { useState } from "react";
import { Stethoscope, User } from "lucide-react";
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

  const handleModeChange = (next: Mode) => {
    setMode(next);
    onModeChange?.(next);
  };

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex gap-2 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-2xl p-1">
        <button
          onClick={() => handleModeChange("professional")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            mode === "professional"
              ? "bg-slate-800 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span className="sm:hidden">Doctor</span>
          <span className="hidden sm:inline">Medical Professional</span>
        </button>
        <button
          onClick={() => handleModeChange("patient")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            mode === "patient"
              ? "bg-medical-600 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <User className="w-4 h-4" />
          Patient
        </button>
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
