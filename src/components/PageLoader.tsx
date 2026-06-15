import { PoveonLogo } from "@/components/PoveonLogo";

/**
 * Full-screen branded loading indicator. Used by route-level loading.tsx files
 * (shown during navigation) and anywhere a page-level spinner is needed.
 */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      <div className="relative">
        <div className="w-12 h-12 rounded-2xl bg-white shadow-lg flex items-center justify-center">
          <PoveonLogo className="w-7 h-7 text-medical-600" />
        </div>
        <span className="absolute -inset-1.5 rounded-2xl border-2 border-medical-200 border-t-medical-600 animate-spin" />
      </div>
      <p className="text-sm font-medium text-slate-400">{label}</p>
    </div>
  );
}

/** Inline spinner for in-page section loading. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-medical-200 border-t-medical-600 animate-spin ${className || "w-5 h-5"}`}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Centered section loader for dashboard panels. */
export function SectionLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Spinner className="w-6 h-6" />
      {label && <p className="text-xs text-slate-400">{label}</p>}
    </div>
  );
}
