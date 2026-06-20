"use client";

import { useEffect, useState } from "react";
import { Search, X, Stethoscope, AlertTriangle, Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";

export interface PickedDoctor { id: string; name: string; has_bank: boolean }
interface DoctorResult { id: string; name: string; specialty: string | null; hospital: string | null; has_bank: boolean }

/**
 * Typeahead picker over a lab's referring-doctor pool. Search-only by default;
 * with `canAdd` (front desk) an unmatched name can be added to the pool. Flags
 * doctors whose bank details are missing.
 */
export function DoctorSearchSelect({
  labId,
  canAdd,
  value,
  onChange,
}: {
  labId?: string;
  canAdd?: boolean;
  value: PickedDoctor | null;
  onChange: (d: PickedDoctor | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DoctorResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newHospital, setNewHospital] = useState("");
  const [newAccount, setNewAccount] = useState("");

  useEffect(() => {
    const q = query.trim();
    if (!labId || q.length < 1) { setResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/onboard/doctors?lab_id=${encodeURIComponent(labId)}&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (!cancelled) setResults(data.doctors ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, labId]);

  async function addNew() {
    const name = query.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await fetch("/api/lab/referral-doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: newPhone || undefined, hospital: newHospital || undefined, account_number: newAccount || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add doctor");
      onChange({ id: data.professional.id, name: data.professional.name, has_bank: data.professional.has_bank });
      setQuery(""); setResults([]); setNewPhone(""); setNewHospital(""); setNewAccount("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add doctor");
    } finally {
      setAdding(false);
    }
  }

  const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-medical-200 bg-medical-50/40 px-3 py-2">
        <Stethoscope className="h-4 w-4 shrink-0 text-medical-600" />
        <span className="truncate text-sm font-medium text-slate-800">{value.name}</span>
        {!value.has_bank && (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-amber-600"><AlertTriangle className="h-3 w-3" /> bank details missing</span>
        )}
        <button type="button" onClick={() => onChange(null)} className="ml-auto shrink-0 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  const q = query.trim();
  const exact = results.some((r) => r.name.toLowerCase() === q.toLowerCase());

  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search referring doctor by name"
          className={`${inputCls} pl-9`}
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>

      {results.length > 0 && (
        <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => { onChange({ id: r.id, name: r.name, has_bank: r.has_bank }); setQuery(""); setResults([]); }}
              className="flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">{r.name}</span>
                {(r.specialty || r.hospital) && <span className="block truncate text-xs text-slate-400">{[r.specialty, r.hospital].filter(Boolean).join(" · ")}</span>}
              </span>
              {!r.has_bank && <span className="shrink-0 text-[10px] text-amber-600">no bank details</span>}
            </button>
          ))}
        </div>
      )}

      {/* Add-new (front desk only) */}
      {canAdd && q.length >= 2 && !exact && !searching && (
        <div className="mt-2 rounded-xl border border-dashed border-medical-300 bg-medical-50/30 p-3">
          <p className="text-xs font-medium text-slate-700">Add &ldquo;{q}&rdquo; as a new referring doctor</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input className={inputCls} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)" />
            <input className={inputCls} value={newHospital} onChange={(e) => setNewHospital(e.target.value)} placeholder="Hospital (optional)" />
            <input className={inputCls} value={newAccount} onChange={(e) => setNewAccount(e.target.value)} placeholder="Account no. (optional)" />
          </div>
          {!newAccount && <p className="mt-1 text-[11px] text-amber-600">No bank details — commission payouts will be blocked until added.</p>}
          <button type="button" onClick={addNew} disabled={adding} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add &amp; select
          </button>
        </div>
      )}

      {value === null && q.length >= 1 && results.length === 0 && !searching && !canAdd && (
        <p className="mt-1 text-xs text-slate-400">No matching doctor in this lab&rsquo;s list.</p>
      )}
    </div>
  );
}
