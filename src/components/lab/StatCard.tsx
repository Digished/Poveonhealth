"use client";

import { ReactNode } from "react";
import clsx from "clsx";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  /** accent color for the icon chip */
  accent?: "medical" | "emerald" | "amber" | "red" | "violet" | "slate";
  className?: string;
}

const ACCENTS: Record<NonNullable<StatCardProps["accent"]>, string> = {
  medical: "bg-medical-500/15 text-medical-300",
  emerald: "bg-emerald-500/15 text-emerald-300",
  amber: "bg-amber-500/15 text-amber-300",
  red: "bg-red-500/15 text-red-300",
  violet: "bg-violet-500/15 text-violet-300",
  slate: "bg-white/10 text-slate-300",
};

/** Compact metric card reused across the LIMS dashboard (Journey / TAT / Professionals). */
export function StatCard({ label, value, hint, icon, accent = "medical", className }: StatCardProps) {
  return (
    <div className={clsx("rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-white truncate">{value}</p>
          {hint != null && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {icon && (
          <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", ACCENTS[accent])}>
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
