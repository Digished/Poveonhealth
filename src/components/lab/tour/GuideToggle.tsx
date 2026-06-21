"use client";

import { GraduationCap } from "lucide-react";
import { useLabTour } from "./TourProvider";

/**
 * Header control that turns the guided tutorial on/off. When on, the step
 * spotlight runs; the preference persists across sessions.
 */
export function GuideToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const { enabled, toggle } = useLabTour();

  if (variant === "row") {
    return (
      <button
        onClick={toggle}
        className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-sm text-slate-300 transition-colors hover:bg-white/8"
      >
        <GraduationCap className={`h-4 w-4 ${enabled ? "text-medical-300" : "text-slate-500"}`} />
        {enabled ? "Tutorial: On" : "Tutorial: Off"}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className={`rounded-lg p-2 transition-colors ${enabled ? "bg-medical-600/20 text-medical-300" : "text-slate-400 hover:bg-white/10 hover:text-white"}`}
      title={enabled ? "Tutorial is on — click to turn off" : "Turn on the step-by-step tutorial"}
    >
      <GraduationCap className="h-4 w-4" />
    </button>
  );
}
