"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Phone, Pill, Search, TicketPercent } from "lucide-react";
import { SectionLoader } from "@/components/PageLoader";

type Pharmacy = {
  id: string; name: string; logo_url: string | null; phone: string | null;
  address: string | null; city: string | null; state: string | null; discount_percent: number;
};

/**
 * Partner pharmacies a care-plan member can walk into, filtered by state.
 *
 * Shown to everyone, member or not — knowing there's a partner nearby is half
 * the reason to join.
 */
export function PharmacyDirectory({ compact = false }: { compact?: boolean }) {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/consults/pharmacies?${params}`, { cache: "no-store" });
      const d = await res.json();
      if (!d.success) return;
      setPharmacies(d.pharmacies);
      // Keep the full state list even while a filter narrows the results.
      if (!state && !q.trim()) setStates(d.states);
    } catch {
      /* leave the last good list on screen */
    } finally {
      setLoading(false);
    }
  }, [state, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-4">
      {!compact && (
        <div>
          <h2 className="text-sm font-bold text-slate-800">Partner pharmacies</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Show your care code at any of these for money off your prescriptions.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or area…"
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

      {loading && pharmacies.length === 0 ? (
        <SectionLoader />
      ) : pharmacies.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
          <Pill className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-600">
            {state || q ? "No partner pharmacies match that" : "No partner pharmacies yet"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {state || q
              ? "Try another state, or clear the search."
              : "We're signing pharmacies up now — your code will work at them as they join."}
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pharmacies.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                {p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo_url} alt={p.name} className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-100" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
                    <Pill className="h-5 w-5 text-emerald-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{p.name}</p>
                  <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                    <span className="line-clamp-2">
                      {[p.address, p.city, p.state].filter(Boolean).join(", ") || "Location on request"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  <TicketPercent className="h-3 w-3" />
                  Up to {p.discount_percent}% off
                </span>
                {p.phone && (
                  <a
                    href={`tel:${p.phone}`}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
                  >
                    <Phone className="h-3 w-3" />
                    Call
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
