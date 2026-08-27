"use client";

import { useMemo, useState } from "react";
import { Search, MapPin, ArrowRight, Building2, X, MessageSquare } from "lucide-react";
import Link from "next/link";

export interface LandingLab {
  id: string;
  name: string;
  slug: string | null;
  address: string;
  logo_url: string | null;
  phones?: unknown;
  whatsapp?: string | null;
  service_categories?: string[] | null;
}

const PAGE = 9;

/**
 * The landing page's primary action: find your lab. Choosing one hands the lab
 * back to the page, which opens that lab's request form on its own headed paper.
 */
export function LabPicker({ labs, onPick }: { labs: LandingLab[]; onPick: (lab: LandingLab) => void }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return labs;
    return labs.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.address ?? "").toLowerCase().includes(q) ||
        (l.service_categories ?? []).some((c) => c.toLowerCase().includes(q))
    );
  }, [labs, query]);

  const visible = showAll || query ? filtered : filtered.slice(0, PAGE);

  return (
    <div>
      {/* Search */}
      <div className="group relative mx-auto max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-medical-600" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by lab name, city or test category…"
          aria-label="Search laboratories"
          className="w-full rounded-2xl border border-stone-200/90 bg-white/85 py-3.5 pl-11 pr-11 text-[14.5px] text-slate-800 shadow-[0_1px_3px_rgba(40,33,20,0.05)] outline-none backdrop-blur transition-all placeholder:text-slate-400 focus:border-medical-300 focus:bg-white focus:shadow-[0_8px_30px_-14px_rgba(2,112,195,0.45)] focus:ring-4 focus:ring-medical-500/10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Results */}
      {visible.length === 0 ? (
        <div className="mx-auto mt-8 max-w-md rounded-3xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
            <Building2 className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-semibold text-slate-700">
            {labs.length === 0 ? "Labs are loading" : `No lab matches “${query}”`}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
            {labs.length === 0
              ? "Refresh in a moment, or reach out and we'll point you to the nearest partner lab."
              : "Try the lab's short name, or the city it's in."}
          </p>
          <Link
            href="/contact"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.03]"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Ask us to add your lab
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((lab, i) => {
              const cats = (lab.service_categories ?? []).filter(Boolean).slice(0, 2);
              return (
                <button
                  key={lab.id}
                  type="button"
                  onClick={() => onPick(lab)}
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  className="animate-fade-in-up group flex h-full items-start gap-3 rounded-2xl border border-stone-200/80 bg-white/80 p-4 text-left shadow-[0_1px_3px_rgba(40,33,20,0.05)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-medical-200 hover:bg-white hover:shadow-[0_20px_40px_-22px_rgba(2,112,195,0.55)] focus:outline-none focus-visible:ring-4 focus-visible:ring-medical-500/20"
                >
                  {lab.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={lab.logo_url}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-0.5 ring-1 ring-stone-200"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-medical-50 text-medical-600 ring-1 ring-medical-100">
                      <Building2 className="h-5 w-5" />
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold leading-snug text-slate-900 group-hover:text-medical-700">
                      {lab.name}
                    </span>
                    {lab.address && (
                      <span className="mt-1 flex items-start gap-1 text-[11.5px] leading-snug text-slate-400">
                        <MapPin className="mt-[2px] h-3 w-3 shrink-0" />
                        <span className="line-clamp-2">{lab.address}</span>
                      </span>
                    )}
                    {cats.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {cats.map((c) => (
                          <span
                            key={c}
                            className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500"
                          >
                            {c}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>

                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900/[0.04] text-slate-400 transition-all duration-300 group-hover:bg-medical-600 group-hover:text-white">
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>

          {!query && !showAll && filtered.length > PAGE && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-5 py-2.5 text-[13px] font-semibold text-slate-700 backdrop-blur transition-all hover:border-medical-200 hover:text-medical-700 hover:shadow-sm"
              >
                Show all {filtered.length} laboratories
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
