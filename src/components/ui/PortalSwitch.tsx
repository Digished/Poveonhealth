"use client";

import { useRouter } from "next/navigation";
import { Stethoscope, User } from "lucide-react";
import { rememberPortal, type PortalKey } from "@/lib/portal-preference";

/**
 * Patient / medical professional toggle, shown above both login forms so
 * whoever landed on the wrong one can cross over without going back. Choosing
 * here also sets what the installed app opens on next time.
 */
export function PortalSwitch({ active }: { active: PortalKey }) {
  const router = useRouter();

  const go = (key: PortalKey) => {
    if (key === active) return;
    rememberPortal(key);
    router.push(key === "doctor" ? "/doc-login" : "/login");
  };

  return (
    <div className="mb-5 flex rounded-2xl border border-slate-200 bg-white/70 p-1 backdrop-blur-sm">
      {([
        ["patient", "Patient", User],
        ["doctor", "Medical professional", Stethoscope],
      ] as const).map(([key, label, Icon]) => {
        const on = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => go(key)}
            aria-pressed={on}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
              on ? "bg-medical-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
