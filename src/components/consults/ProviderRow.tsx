"use client";

import { FlaskConical, Lock, Pill, X } from "lucide-react";
import type { Provider } from "@/components/consults/ProviderPicker";

/** The compact row that opens the picker and shows what's chosen. */
export function ProviderRow({
  kind, provider, onOpen, onClear, locked = null,
}: {
  kind: "pharmacy" | "lab";
  provider: Provider | null;
  onOpen: () => void;
  onClear?: () => void;
  /**
   * Why this choice cannot be changed yet, or null when it can. A pharmacy
   * settles for 30 days once chosen; saying so here is cheaper for everyone
   * than letting someone tap Change and be refused.
   */
  locked?: string | null;
}) {
  const Icon = kind === "pharmacy" ? Pill : FlaskConical;
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
    <div className="flex items-center gap-3 p-3">
      {provider?.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={provider.logo_url} alt={provider.name} className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-100" />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          <Icon className="h-4 w-4 text-slate-400" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {provider?.name ?? `No ${kind === "pharmacy" ? "pharmacy" : "laboratory"} chosen`}
        </p>
        <p className="truncate text-xs text-slate-400">
          {provider
            ? [provider.city, provider.state].filter(Boolean).join(", ") || "Location on request"
            : "Optional — pick one you can get to easily"}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onOpen}
          disabled={!!locked}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-medical-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200"
        >
          {provider ? "Change" : "Choose"}
        </button>
        {provider && onClear && !locked && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
            aria-label="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>

    {locked && (
      <p className="flex items-start gap-1.5 border-t border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        <Lock className="mt-px h-3 w-3 shrink-0 text-slate-400" />
        {locked}
      </p>
    )}
    </div>
  );
}
