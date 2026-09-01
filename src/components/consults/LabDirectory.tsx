"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { Check, FlaskConical, MapPin, Phone, Search, Star, TicketPercent } from "lucide-react";
import { SectionLoader } from "@/components/PageLoader";
import { parsePhones } from "@/lib/phones";

type Lab = {
  id: string; name: string; logo_url: string | null;
  address: string | null; city: string | null; state: string | null;
  /** A JSON column: older rows hold plain strings, newer ones {number,label}. */
  phones: unknown;
};

/**
 * Partner labs, with the member's own one marked.
 *
 * A preference, not a restriction: the care code works at every partner. What
 * it changes is that the chosen lab can see the tests scheduled for them and
 * have the bench ready.
 */
export function LabDirectory({
  preferredId,
  canChoose = false,
  onPreferredChange,
}: {
  preferredId?: string | null;
  /** Only a member with an active plan has a preference to set. */
  canChoose?: boolean;
  onPreferredChange?: (id: string | null) => void;
}) {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [discount, setDiscount] = useState<number | null>(null);
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [preferred, setPreferred] = useState<string | null>(preferredId ?? null);

  useEffect(() => { setPreferred(preferredId ?? null); }, [preferredId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (state) params.set("state", state);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/consults/labs?${params}`, { cache: "no-store" });
      const d = await res.json();
      if (!d.success) return;
      setLabs(d.labs);
      setDiscount(d.discount_percent ?? null);
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

  async function choose(id: string | null) {
    setSaving(id ?? "clear");
    try {
      const res = await fetch("/api/consults/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_lab_id: id }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save that."); return; }
      setPreferred(id);
      onPreferredChange?.(id);
      toast.success(id ? "That's your lab now" : "Cleared");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-slate-800">Partner laboratories</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Show your care code at any of these{discount ? ` for up to ${discount}% off` : ""}. Pick the
          one you use and they&apos;ll see the tests your doctor schedules.
        </p>
      </div>

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

      {loading && labs.length === 0 ? (
        <SectionLoader />
      ) : labs.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
          <FlaskConical className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-600">
            {state || q ? "No partner labs match that" : "No partner labs yet"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {state || q ? "Try another state, or clear the search." : "We're signing labs up now."}
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {labs.map((l) => {
            const mine = preferred === l.id;
            return (
              <div
                key={l.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                  mine ? "border-medical-300 ring-1 ring-medical-200" : "border-slate-100"
                }`}
              >
                <div className="flex items-start gap-3">
                  {l.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.logo_url} alt={l.name} className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-slate-100" />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-medical-50">
                      <FlaskConical className="h-5 w-5 text-medical-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{l.name}</p>
                    <p className="mt-0.5 flex items-start gap-1 text-xs text-slate-500">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                      <span className="line-clamp-2">
                        {[l.address, l.city, l.state].filter(Boolean).join(", ") || "Location on request"}
                      </span>
                    </p>
                  </div>
                  {mine && (
                    <span className="shrink-0 rounded-full bg-medical-50 p-1.5 text-medical-600">
                      <Star className="h-3.5 w-3.5 fill-current" />
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {discount != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-medical-50 px-2.5 py-1 text-[11px] font-bold text-medical-700">
                      <TicketPercent className="h-3 w-3" /> Up to {discount}% off
                    </span>
                  )}
                  {parsePhones(l.phones)[0] && (
                    <a
                      href={`tel:${parsePhones(l.phones)[0].number}`}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-200"
                    >
                      <Phone className="h-3 w-3" /> Call
                    </a>
                  )}
                  {canChoose && (
                    <button
                      onClick={() => choose(mine ? null : l.id)}
                      disabled={saving != null}
                      className={`ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${
                        mine
                          ? "bg-medical-600 text-white hover:bg-medical-700"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {mine ? <><Check className="h-3 w-3" /> My lab</> : "Make this mine"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
