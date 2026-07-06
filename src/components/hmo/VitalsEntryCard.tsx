"use client";

import { useState } from "react";
import { Activity, Droplets, Plus } from "lucide-react";
import toast from "react-hot-toast";

type TriggeredAlert = { type: string; severity: string; message: string };

export function VitalsEntryCard({ onSaved }: { onSaved: () => void }) {
  const [tab, setTab] = useState<"bp" | "sugar">("bp");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [glucose, setGlucose] = useState("");
  const [context, setContext] = useState<"fasting" | "random">("fasting");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [alerts, setAlerts] = useState<TriggeredAlert[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAlerts([]);
    try {
      const body =
        tab === "bp"
          ? { type: "bp", systolic, diastolic, ...(pulse ? { pulse } : {}), ...(note ? { note } : {}) }
          : { type: "sugar", glucose_mg_dl: glucose, glucose_context: context, ...(note ? { note } : {}) };

      const res = await fetch("/api/hmo/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save reading.");
        return;
      }
      toast.success("Reading saved");
      setAlerts(data.alerts ?? []);
      setSystolic(""); setDiastolic(""); setPulse(""); setGlucose(""); setNote("");
      onSaved();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition";

  return (
    <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-5">
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => { setTab("bp"); setAlerts([]); }}
          className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-xl transition ${
            tab === "bp" ? "bg-medical-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          <Activity className="w-4 h-4" /> Blood Pressure
        </button>
        <button
          type="button"
          onClick={() => { setTab("sugar"); setAlerts([]); }}
          className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-xl transition ${
            tab === "sugar" ? "bg-medical-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          <Droplets className="w-4 h-4" /> Blood Sugar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {tab === "bp" ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Systolic (mmHg)</label>
              <input type="number" inputMode="numeric" required min={50} max={300} placeholder="120"
                value={systolic} onChange={(e) => setSystolic(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Diastolic (mmHg)</label>
              <input type="number" inputMode="numeric" required min={30} max={200} placeholder="80"
                value={diastolic} onChange={(e) => setDiastolic(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Pulse (optional)</label>
              <input type="number" inputMode="numeric" min={20} max={250} placeholder="72"
                value={pulse} onChange={(e) => setPulse(e.target.value)} className={inputCls} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">Blood sugar (mg/dL)</label>
              <input type="number" inputMode="decimal" required min={10} max={1000} step="0.1" placeholder="95"
                value={glucose} onChange={(e) => setGlucose(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">When was it taken?</label>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                {(["fasting", "random"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setContext(c)}
                    className={`flex-1 text-sm font-medium py-2.5 transition ${
                      context === c ? "bg-medical-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}>
                    {c === "fasting" ? "Fasting" : "Random"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <input type="text" maxLength={500} placeholder="Note (optional) — e.g. after morning walk"
          value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />

        <button type="submit" disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md">
          <Plus className="w-4 h-4" /> {saving ? "Saving…" : "Save Reading"}
        </button>
      </form>

      {alerts.length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-1">
            This reading is outside the normal range
          </p>
          <ul className="text-xs text-amber-700 space-y-0.5 mb-2">
            {alerts.map((a, i) => (
              <li key={i}>{a.message}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-700">
            Your care team has been notified. If you feel unwell, please seek medical attention right away.
          </p>
        </div>
      )}
    </div>
  );
}
