"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { FlaskConical, FlaskRound, Check } from "lucide-react";
import { EmrShell } from "@/components/emr/EmrShell";

interface LabTest { id: string; test_name: string; result_value: string | null; result_unit: string | null; reference_range: string | null; flag: string | null; status: string; }
interface LabOrder {
  id: string; status: string; clinical_note: string | null; created_at: string;
  tests: LabTest[];
  patient: { full_name: string; hospital_number: string; age: number | null; sex: string | null };
}

function LabInner() {
  const [list, setList] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LabOrder | null>(null);
  const [results, setResults] = useState<Record<string, { result_value: string; result_unit: string; reference_range: string; flag: string }>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/emr/lab-orders?status=open");
      const data = await res.json();
      if (res.ok) setList(data.lab_orders);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function collect(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/emr/lab-orders/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "collect" }),
      });
      if (res.ok) { toast.success("Sample collected."); await load(); }
    } finally { setBusy(false); }
  }

  function startResults(o: LabOrder) {
    setEditing(o);
    const seed: typeof results = {};
    o.tests.forEach((t) => { seed[t.id] = { result_value: t.result_value ?? "", result_unit: t.result_unit ?? "", reference_range: t.reference_range ?? "", flag: t.flag ?? "normal" }; });
    setResults(seed);
  }

  async function saveResults() {
    if (!editing) return;
    setBusy(true);
    try {
      const payload = Object.entries(results).map(([id, r]) => ({ id, ...r }));
      const res = await fetch(`/api/emr/lab-orders/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "result", results: payload }),
      });
      if (res.ok) { toast.success("Results saved."); setEditing(null); await load(); }
      else toast.error("Failed.");
    } finally { setBusy(false); }
  }

  const cls = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none";

  if (editing) {
    return (
      <div className="space-y-4 pb-24">
        <button onClick={() => setEditing(null)} className="text-sm font-semibold text-slate-500">← Back</button>
        <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl p-4 text-white shadow-md">
          <p className="text-lg font-bold">{editing.patient.full_name}</p>
          <p className="text-xs text-white/70 font-mono">{editing.patient.hospital_number}</p>
        </div>
        <div className="space-y-3">
          {editing.tests.map((t) => (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
              <p className="text-sm font-semibold text-slate-800 mb-2">{t.test_name}</p>
              <div className="grid grid-cols-2 gap-2">
                <input className={cls} placeholder="Result" value={results[t.id]?.result_value ?? ""} onChange={(e) => setResults((r) => ({ ...r, [t.id]: { ...r[t.id], result_value: e.target.value } }))} />
                <input className={cls} placeholder="Unit" value={results[t.id]?.result_unit ?? ""} onChange={(e) => setResults((r) => ({ ...r, [t.id]: { ...r[t.id], result_unit: e.target.value } }))} />
                <input className={cls} placeholder="Reference range" value={results[t.id]?.reference_range ?? ""} onChange={(e) => setResults((r) => ({ ...r, [t.id]: { ...r[t.id], reference_range: e.target.value } }))} />
                <select className={cls} value={results[t.id]?.flag ?? "normal"} onChange={(e) => setResults((r) => ({ ...r, [t.id]: { ...r[t.id], flag: e.target.value } }))}>
                  <option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option><option value="abnormal">Abnormal</option>
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-slate-200 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <button onClick={saveResults} disabled={busy} className="w-full bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Save & report results</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Open lab orders · {list.length}</p>
      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2].map(i=><div key={i} className="h-24 bg-white rounded-2xl border border-slate-100" />)}</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16"><FlaskConical className="w-8 h-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">No open orders.</p></div>
      ) : (
        list.map((o) => (
          <div key={o.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{o.patient.full_name}</p>
                <p className="text-[11px] text-slate-400 font-mono">{o.patient.hospital_number}</p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${o.status === "collected" ? "bg-medical-50 text-medical-600" : "bg-amber-50 text-amber-600"}`}>{o.status}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {o.tests.map((t) => <span key={t.id} className="text-[11px] bg-violet-50 text-violet-700 rounded-full px-2 py-0.5">{t.test_name}</span>)}
            </div>
            <div className="flex gap-2">
              {o.status === "ordered" && (
                <button onClick={() => collect(o.id)} disabled={busy} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl py-2 flex items-center justify-center gap-1.5"><FlaskRound className="w-4 h-4" /> Mark collected</button>
              )}
              <button onClick={() => startResults(o)} className="flex-1 bg-medical-600 hover:bg-medical-700 text-white text-sm font-semibold rounded-xl py-2 flex items-center justify-center gap-1.5"><Check className="w-4 h-4" /> Enter results</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function LaboratoryPage() {
  return (
    <EmrShell title="Laboratory" allow={["lab_tech"]}>
      <LabInner />
    </EmrShell>
  );
}
