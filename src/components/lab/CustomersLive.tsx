"use client";

import { FlaskConical, Sun, Moon } from "lucide-react";
import { useDashTheme } from "@/hooks/useDashTheme";
import { CustomersView } from "@/components/lab/CustomersView";

/**
 * Full-page shell for the pop-out live customers board. Shares the lab
 * dashboard's dark/light theme preference so both tabs look consistent.
 */
export function CustomersLive({ labName, labLogoUrl }: { labName: string; labLogoUrl: string | null }) {
  const { isLight, toggle, themeClass } = useDashTheme("lab_dash_theme");

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-900 via-medical-950 to-slate-900 text-white transition-colors duration-300 ${themeClass}`}>
      <header className="sticky top-0 z-10 border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            {labLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={labLogoUrl} alt={labName} className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-medical-600">
                <FlaskConical className="h-4 w-4 text-white" />
              </div>
            )}
            <h1 className="text-sm font-bold leading-none text-white">{labName}</h1>
          </div>
          <button
            onClick={toggle}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            title={isLight ? "Switch to dark mode" : "Switch to light mode"}
          >
            {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <CustomersView labName={labName} live />
      </main>
    </div>
  );
}
