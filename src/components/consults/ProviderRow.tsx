"use client";

import { Check, FlaskConical, MapPin, Pill, X } from "lucide-react";
import type { Provider } from "@/components/consults/ProviderPicker";

/** The compact row that opens the picker and shows what's chosen. */
export function ProviderRow({
  kind, provider, onOpen, onClear,
}: {
  kind: "pharmacy" | "lab";
  provider: Provider | null;
  onOpen: () => void;
  onClear?: () => void;
}) {
  const Icon = kind === "pharmacy" ? Pill : FlaskConical;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
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
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-medical-300"
        >
          {provider ? "Change" : "Choose"}
        </button>
        {provider && onClear && (
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
  );
}
