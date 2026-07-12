"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, FileText, Printer } from "lucide-react";

interface HistoryRow {
  id: string;
  department: string | null;
  pdf_url: string | null;
  updated_at: string;
  verified_by: string | null;
  request: { code: string; patient_name: string | null; patient_phone: string | null };
}

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export function PastResults() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lab/results/history${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      setRows(Array.isArray(data.results) ? data.results : []);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><FileText className="h-5 w-5 text-medical-300" /> Past results</h2>
        <p className="mt-1 text-sm text-slate-400">Search and reprint results already reported to clients.</p>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-slate-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, code or phone…" className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-medical-400" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-white/5 py-10 text-center text-sm text-slate-400">{query ? "No matching results." : "No results reported yet."}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-white/5 px-4 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{r.request.patient_name || "Unnamed"} <span className="ml-1 font-mono text-xs font-normal text-slate-500">{r.request.code}</span></p>
                <p className="text-[11px] text-slate-400">{[r.department, r.verified_by ? `by ${r.verified_by}` : null, fmt(r.updated_at)].filter(Boolean).join(" · ")}</p>
              </div>
              <a href={`/api/lab/results/${r.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-medical-300 hover:bg-white/5">
                <Printer className="h-3.5 w-3.5" /> View
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
