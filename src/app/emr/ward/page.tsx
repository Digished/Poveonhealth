"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { BedDouble, Plus, LogOut, Search } from "lucide-react";
import { EmrShell } from "@/components/emr/EmrShell";
import { Button } from "@/components/ui/Button";

interface Admission {
  id: string; ward_name: string; bed_label: string | null; reason: string | null; status: string; admitted_at: string;
  patient: { full_name: string; hospital_number: string; age: number | null; sex: string | null };
}
interface LookupPatient { id: string; full_name: string; hospital_number: string; }

function WardInner() {
  const [list, setList] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdmit, setShowAdmit] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LookupPatient[]>([]);
  const [picked, setPicked] = useState<LookupPatient | null>(null);
  const [ward, setWard] = useState("");
  const [bed, setBed] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/emr/admissions?status=admitted");
      const data = await res.json();
      if (res.ok) setList(data.admissions);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function lookup() {
    if (!search.trim()) return;
    const res = await fetch(`/api/emr/patient-lookup?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    if (res.ok) setResults(data.patients);
  }

  async function admit() {
    if (!picked) return toast.error("Pick a patient.");
    if (!ward.trim()) return toast.error("Ward name required.");
    setBusy(true);
    try {
      const res = await fetch("/api/emr/admissions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: picked.id, ward_name: ward, bed_label: bed, reason }),
      });
      if (res.ok) {
        toast.success("Patient admitted.");
        setShowAdmit(false); setPicked(null); setWard(""); setBed(""); setReason(""); setSearch(""); setResults([]);
        await load();
      } else toast.error("Failed to admit.");
    } finally { setBusy(false); }
  }

  async function discharge(id: string) {
    const summary = window.prompt("Discharge summary (optional):") ?? "";
    setBusy(true);
    try {
      const res = await fetch(`/api/emr/admissions/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "discharge", discharge_summary: summary }),
      });
      if (res.ok) { toast.success("Discharged."); await load(); }
    } finally { setBusy(false); }
  }

  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none";

  return (
    <div className="space-y-3">
      {!showAdmit && <Button onClick={() => setShowAdmit(true)} fullWidth size="sm"><Plus className="w-4 h-4" /> Admit patient</Button>}

      {showAdmit && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input className={`${cls} pl-9`} placeholder="Find patient" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} />
            </div>
            <Button onClick={lookup} variant="ghost" size="sm">Search</Button>
          </div>
          {results.length > 0 && !picked && (
            <div className="space-y-1">
              {results.map((p) => (
                <button key={p.id} onClick={() => { setPicked(p); setResults([]); }} className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 text-sm">
                  <span className="font-medium text-slate-700">{p.full_name}</span><span className="text-xs text-slate-400 font-mono">{p.hospital_number}</span>
                </button>
              ))}
            </div>
          )}
          {picked && <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Admitting <b>{picked.full_name}</b> <button onClick={() => setPicked(null)} className="underline text-slate-400 ml-1">change</button></p>}
          <div className="grid grid-cols-2 gap-2">
            <input className={cls} placeholder="Ward (e.g. Male Medical)" value={ward} onChange={(e) => setWard(e.target.value)} />
            <input className={cls} placeholder="Bed (e.g. 4)" value={bed} onChange={(e) => setBed(e.target.value)} />
          </div>
          <input className={cls} placeholder="Reason for admission" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={admit} loading={busy} size="sm" fullWidth>Admit</Button>
            <Button onClick={() => setShowAdmit(false)} variant="ghost" size="sm">Cancel</Button>
          </div>
        </div>
      )}

      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">On the ward · {list.length}</p>
      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2].map(i=><div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />)}</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12"><BedDouble className="w-8 h-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">No admitted patients.</p></div>
      ) : (
        list.map((a) => (
          <div key={a.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-medical-50 text-medical-600 flex items-center justify-center shrink-0"><BedDouble className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{a.patient.full_name}</p>
              <p className="text-[11px] text-slate-400 truncate">{a.ward_name}{a.bed_label ? ` · Bed ${a.bed_label}` : ""}{a.reason ? ` · ${a.reason}` : ""}</p>
            </div>
            <button onClick={() => discharge(a.id)} disabled={busy} title="Discharge" className="p-2 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 shrink-0"><LogOut className="w-4 h-4" /></button>
          </div>
        ))
      )}
    </div>
  );
}

export default function WardPage() {
  return (
    <EmrShell title="Ward" allow={["ward_nurse", "nurse", "doctor"]}>
      <WardInner />
    </EmrShell>
  );
}
