"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FlaskConical, Loader2, MapPin, Pill, Search, X } from "lucide-react";
import { useViewport } from "@/components/ui/Overlay";

export type Provider = {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  discount_percent?: number;
};

/**
 * Choose a preferred pharmacy or laboratory.
 *
 * Used inline during enrolment and as a sheet from the care plan afterwards.
 * Always skippable — a preference makes the plan easier to use, but the care
 * code works at every partner regardless.
 */
export function ProviderPicker({
  kind, value, onChange, onClose,
}: {
  kind: "pharmacy" | "lab";
  value: string | null;
  onChange: (provider: Provider | null) => void;
  /** Given when the picker is a sheet rather than an inline field. */
  onClose?: () => void;
}) {
  const vp = useViewport(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const endpoint = kind === "pharmacy" ? "/api/consults/pharmacies" : "/api/consults/labs";
  const listKey = kind === "pharmacy" ? "pharmacies" : "labs";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      const d = await res.json();
      if (!d.success) return;
      setProviders(d[listKey] ?? []);
      if (!state && !q.trim()) setStates(d.states ?? []);
    } catch {
      /* keep whatever is on screen */
    } finally {
      setLoading(false);
    }
  }, [endpoint, listKey, state, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const Icon = kind === "pharmacy" ? Pill : FlaskConical;
  // Written out rather than interpolated: Tailwind scans source text, so a
  // `border-${tone}-400` would be purged from the build.
  const pickedClass =
    kind === "pharmacy" ? "border-emerald-400 bg-emerald-50" : "border-medical-400 bg-medical-50";

  const body = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${kind === "pharmacy" ? "pharmacies" : "labs"}…`}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40"
          />
        </div>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-medical-400 focus:outline-none"
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {loading && providers.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : providers.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No partner {kind === "pharmacy" ? "pharmacies" : "labs"} match that yet.
          </p>
        ) : (
          providers.map((p) => {
            const picked = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(picked ? null : p); onClose?.(); }}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  picked ? pickedClass : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                {p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo_url} alt={p.name} className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-100" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Icon className="h-4 w-4 text-slate-400" />
                  </div>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{p.name}</span>
                  <span className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                    <span className="line-clamp-1">
                      {[p.city, p.state].filter(Boolean).join(", ") || p.address || "Location on request"}
                    </span>
                  </span>
                </span>
                {picked && <Check className="h-4 w-4 shrink-0 text-medical-600" />}
              </button>
            );
          })
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        Just a preference — your care code works at every partner.
      </p>
    </div>
  );

  if (!onClose) return body;

  return (
    <div
      className="animate-fade-in fixed z-[310] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      // Anchored to the visual viewport, not the layout one: when the mobile
      // keyboard opens the two stop agreeing, and a dialog sized to the layout
      // viewport puts its own inputs behind the keys.
      style={vp.height ? { top: vp.top, left: vp.left, width: vp.width, height: vp.height } : { inset: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="animate-slide-up w-full overflow-hidden rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">
            Choose your {kind === "pharmacy" ? "pharmacy" : "laboratory"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

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
