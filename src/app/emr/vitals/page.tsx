"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { Activity, ShieldAlert, ArrowLeft, Check } from "lucide-react";
import { EmrShell } from "@/components/emr/EmrShell";
import { Button } from "@/components/ui/Button";

interface QueueItem {
  id: string;
  chief_complaint: string | null;
  created_at: string;
  patient: { id: string; full_name: string; hospital_number: string; age: number | null; sex: string | null; allergies: string | null };
}

const VITAL_FIELDS = [
  { key: "temperature", label: "Temp", unit: "°C", step: "0.1" },
  { key: "pulse", label: "Pulse", unit: "bpm" },
  { key: "systolic", label: "Systolic", unit: "mmHg" },
  { key: "diastolic", label: "Diastolic", unit: "mmHg" },
  { key: "resp_rate", label: "Resp", unit: "/min" },
  { key: "spo2", label: "SpO₂", unit: "%" },
  { key: "weight_kg", label: "Weight", unit: "kg", step: "0.1" },
  { key: "height_cm", label: "Height", unit: "cm", step: "0.1" },
  { key: "blood_sugar", label: "RBS", unit: "mmol/L", step: "0.1" },
  { key: "pain_score", label: "Pain", unit: "/10" },
] as const;

function VitalsInner() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<QueueItem | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/emr/encounters?dept=vitals");
      const data = await res.json();
      if (res.ok) setQueue(data.encounters);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!active) return;
    setSaving(true);
    try {
      const res = await fetch("/api/emr/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encounter_id: active.id, ...values }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed."); return; }
      toast.success("Vitals saved — sent to Consultation.");
      setActive(null);
      setValues({});
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (active) {
    return (
      <div className="space-y-4 pb-24">
        <button onClick={() => { setActive(null); setValues({}); }} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500"><ArrowLeft className="w-4 h-4" /> Back to queue</button>
        <div className="bg-gradient-to-br from-medical-600 to-medical-800 rounded-2xl p-4 text-white shadow-md">
          <p className="text-lg font-bold leading-tight">{active.patient.full_name}</p>
          <p className="text-xs text-white/70 font-mono">{active.patient.hospital_number} · {active.patient.age ?? "—"} {active.patient.sex ?? ""}</p>
          {active.chief_complaint && <p className="text-sm text-white/90 mt-1">{active.chief_complaint}</p>}
          {active.patient.allergies && <p className="mt-2 text-xs bg-amber-400/20 text-amber-50 rounded-lg px-2 py-1 inline-flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" />{active.patient.allergies}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-2 gap-3">
          {VITAL_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="text-[11px] font-semibold text-slate-500 mb-1 block">{f.label} <span className="text-slate-300">{f.unit}</span></label>
              <input
                type="number" inputMode="decimal" step={("step" in f && f.step) || "1"}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-slate-200 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <Button onClick={save} loading={saving} fullWidth><Check className="w-4 h-4" /> Save vitals & forward</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Waiting for vitals · {queue.length}</p>
      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2,3].map(i=><div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />)}</div>
      ) : queue.length === 0 ? (
        <div className="text-center py-16"><Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">Queue is clear.</p></div>
      ) : (
        queue.map((q) => (
          <button key={q.id} onClick={() => setActive(q)} className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex items-center gap-3 hover:border-medical-200 transition">
            <div className="w-9 h-9 rounded-full bg-medical-50 text-medical-600 flex items-center justify-center shrink-0"><Activity className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{q.patient.full_name}</p>
              <p className="text-[11px] text-slate-400 truncate">{q.patient.hospital_number} · {q.chief_complaint || "—"}</p>
            </div>
            {q.patient.allergies && <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />}
          </button>
        ))
      )}
    </div>
  );
}

export default function VitalsPage() {
  return (
    <EmrShell title="Vitals" allow={["nurse", "ward_nurse"]}>
      <VitalsInner />
    </EmrShell>
  );
}
