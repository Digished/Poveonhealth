"use client";

import { useState, useEffect, useCallback } from "react";
import { Stethoscope, ShieldAlert } from "lucide-react";
import { EmrShell } from "@/components/emr/EmrShell";
import { ConsultationEditor } from "@/components/emr/ConsultationEditor";

interface QueueItem {
  id: string;
  status: string;
  chief_complaint: string | null;
  patient: { full_name: string; hospital_number: string; age: number | null; sex: string | null; allergies: string | null };
  latest_vitals: { temperature: number | null; systolic: number | null; diastolic: number | null } | null;
}

function ConsultationInner() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/emr/encounters?dept=consultation");
      const data = await res.json();
      if (res.ok) setQueue(data.encounters);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (activeId) {
    return <ConsultationEditor encounterId={activeId} onClose={() => { setActiveId(null); load(); }} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Waiting to be seen · {queue.length}</p>
      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2,3].map(i=><div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />)}</div>
      ) : queue.length === 0 ? (
        <div className="text-center py-16"><Stethoscope className="w-8 h-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">No patients waiting.</p></div>
      ) : (
        queue.map((q) => (
          <button key={q.id} onClick={() => setActiveId(q.id)} className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex items-center gap-3 hover:border-medical-200 transition">
            <div className="w-9 h-9 rounded-full bg-medical-50 text-medical-600 flex items-center justify-center shrink-0"><Stethoscope className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-800 truncate">{q.patient.full_name}</p>
                {q.status === "in_consult" && <span className="text-[10px] bg-medical-50 text-medical-600 font-semibold px-1.5 py-0.5 rounded">open</span>}
              </div>
              <p className="text-[11px] text-slate-400 truncate">{q.patient.hospital_number} · {q.chief_complaint || "—"}</p>
            </div>
            {q.patient.allergies && <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />}
          </button>
        ))
      )}
    </div>
  );
}

export default function ConsultationPage() {
  return (
    <EmrShell title="Consultation" allow={["doctor"]}>
      <ConsultationInner />
    </EmrShell>
  );
}
