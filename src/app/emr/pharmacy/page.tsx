"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { Pill, ShieldAlert, Check, X } from "lucide-react";
import { EmrShell } from "@/components/emr/EmrShell";
import type { ParsedRxItem } from "@/lib/emr/prescription";

interface Rx {
  id: string;
  status: string;
  raw_text: string | null;
  created_at: string;
  items: (ParsedRxItem & { id: string; status: string })[];
  patient: { full_name: string; hospital_number: string; age: number | null; sex: string | null; allergies: string | null };
}

function PharmacyInner() {
  const [list, setList] = useState<Rx[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/emr/prescriptions?status=pending");
      const data = await res.json();
      if (res.ok) setList(data.prescriptions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, status: "dispensed" | "cancelled") {
    setBusy(id);
    try {
      const res = await fetch(`/api/emr/prescriptions/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) { toast.success(status === "dispensed" ? "Marked dispensed." : "Cancelled."); await load(); }
      else toast.error("Failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Prescriptions to dispense · {list.length}</p>
      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2].map(i=><div key={i} className="h-32 bg-white rounded-2xl border border-slate-100" />)}</div>
      ) : list.length === 0 ? (
        <div className="text-center py-16"><Pill className="w-8 h-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">No pending prescriptions.</p></div>
      ) : (
        list.map((rx) => (
          <div key={rx.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{rx.patient.full_name}</p>
                <p className="text-[11px] text-slate-400 font-mono">{rx.patient.hospital_number} · {rx.patient.age ?? "—"} {rx.patient.sex ?? ""}</p>
              </div>
              {rx.patient.allergies && <span className="text-[11px] bg-amber-50 text-amber-700 rounded-lg px-2 py-1 flex items-center gap-1 shrink-0"><ShieldAlert className="w-3.5 h-3.5" />{rx.patient.allergies}</span>}
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-100 mb-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400"><tr>
                  <th className="text-left font-semibold px-2 py-1.5">Drug</th>
                  <th className="text-left font-semibold px-2 py-1.5">Dose</th>
                  <th className="text-left font-semibold px-2 py-1.5">Freq</th>
                  <th className="text-left font-semibold px-2 py-1.5">Days</th>
                </tr></thead>
                <tbody>
                  {rx.items.map((it) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-medium text-slate-700">{it.form ? `${it.form} ` : ""}{it.drug_name}</td>
                      <td className="px-2 py-1.5 text-slate-600">{it.strength ?? it.dose ?? "—"}</td>
                      <td className="px-2 py-1.5 text-slate-600">{it.frequency ?? "—"}{it.frequency_per_day ? ` (${it.frequency_per_day}/day)` : ""}</td>
                      <td className="px-2 py-1.5 text-slate-600">{it.duration_days ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <button onClick={() => act(rx.id, "dispensed")} disabled={busy === rx.id} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl py-2 flex items-center justify-center gap-1.5"><Check className="w-4 h-4" /> Dispense all</button>
              <button onClick={() => act(rx.id, "cancelled")} disabled={busy === rx.id} className="px-3 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl"><X className="w-4 h-4" /></button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function PharmacyPage() {
  return (
    <EmrShell title="Pharmacy" allow={["pharmacist"]}>
      <PharmacyInner />
    </EmrShell>
  );
}
