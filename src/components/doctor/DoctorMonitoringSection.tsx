"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, Bell, Check, ChevronLeft, Droplets, Flag,
  HeartPulse, Loader2, RefreshCw, Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { TrendChart } from "@/components/hmo/TrendChart";
import { Reading, bpSeries, sugarSeries, formatReading } from "@/components/hmo/VitalsHistory";

type PanelPatient = {
  id: string;
  full_name: string;
  email: string;
  policy_number: string;
  phone: string | null;
  date_of_birth: string | null;
  sex: string | null;
  hmo_name: string;
  flagged: boolean;
  flag_note: string | null;
  latest_bp: Reading | null;
  latest_sugar: Reading | null;
  open_alerts: number;
};

type Alert = {
  id: string;
  type: string;
  severity: "warning" | "critical";
  message: string;
  status: "open" | "acknowledged";
  created_at: string;
  member?: { id: string; full_name: string; policy_number: string; hmo: { name: string } };
};

function SeverityBadge({ severity }: { severity: string }) {
  return severity === "critical" ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" /> Critical
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
      <Bell className="w-3 h-3" /> Warning
    </span>
  );
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Patient detail ─────────────────────────────────────────────────────────────

function PatientDetail({ memberId, onBack, onChanged }: { memberId: string; onBack: () => void; onChanged: () => void }) {
  const [patient, setPatient] = useState<PanelPatient | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [flagNote, setFlagNote] = useState("");
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/doc-login/monitoring/patients/${memberId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to load patient"); onBack(); return; }
      setPatient(data.patient);
      setReadings(data.readings);
      setAlerts(data.alerts);
    } catch { toast.error("Network error"); }
    finally { setLoading(false); }
  }, [memberId, onBack]);

  useEffect(() => { load(); }, [load]);

  async function setFlag(flagged: boolean, note?: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/doc-login/monitoring/patients/${memberId}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged, ...(note ? { note } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed"); return; }
      toast.success(flagged ? "Patient flagged" : "Flag removed");
      setShowFlagForm(false);
      setFlagNote("");
      load();
      onChanged();
    } catch { toast.error("Network error"); }
    finally { setBusy(false); }
  }

  async function acknowledge(alertId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/doc-login/monitoring/alerts/${alertId}`, { method: "PATCH" });
      if (!res.ok) { toast.error("Failed to acknowledge"); return; }
      load();
      onChanged();
    } catch { toast.error("Network error"); }
    finally { setBusy(false); }
  }

  if (loading || !patient) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition mb-2">
          <ChevronLeft className="w-3 h-3" /> All patients
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-base font-bold text-slate-800 flex items-center gap-2">
              {patient.full_name}
              {patient.flagged && <Flag className="w-4 h-4 text-red-500" />}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {patient.hmo_name} · {patient.policy_number} · {patient.email}
              {patient.date_of_birth ? ` · DOB ${patient.date_of_birth}` : ""}
              {patient.sex ? ` · ${patient.sex}` : ""}
            </p>
            {patient.flagged && patient.flag_note && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mt-2">
                Flag note: {patient.flag_note}
              </p>
            )}
          </div>
          {patient.flagged ? (
            <button disabled={busy} onClick={() => setFlag(false)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-3 py-2 rounded-xl transition">
              <Flag className="w-3.5 h-3.5" /> Remove flag
            </button>
          ) : showFlagForm ? (
            <form className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); setFlag(true, flagNote); }}>
              <input autoFocus value={flagNote} onChange={(e) => setFlagNote(e.target.value)}
                placeholder="Reason (optional)" maxLength={500}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-300 w-48" />
              <button type="submit" disabled={busy}
                className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-2 rounded-xl transition">
                Flag
              </button>
              <button type="button" onClick={() => setShowFlagForm(false)}
                className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
            </form>
          ) : (
            <button onClick={() => setShowFlagForm(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-2 rounded-xl transition">
              <Flag className="w-3.5 h-3.5" /> Flag as concern
            </button>
          )}
        </div>
      </div>

      {/* Alerts for this patient */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-amber-500" /> Alerts
          </h4>
          <ul className="divide-y divide-slate-100">
            {alerts.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 flex items-center gap-2 flex-wrap">
                    <SeverityBadge severity={a.severity} /> {a.message}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{timeAgo(a.created_at)}</p>
                </div>
                {a.status === "open" ? (
                  <button disabled={busy} onClick={() => acknowledge(a.id)}
                    className="flex items-center gap-1 text-xs font-semibold text-medical-600 hover:text-medical-700 border border-medical-200 hover:border-medical-300 px-2.5 py-1.5 rounded-lg transition shrink-0">
                    <Check className="w-3 h-3" /> Acknowledge
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 shrink-0">Acknowledged</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trends */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-medical-600" /> Blood Pressure Trend
        </h4>
        <TrendChart
          series={readings.some((r) => r.type === "bp") ? bpSeries(readings) : []}
          unit="mmHg"
          thresholds={[{ value: 140, label: "140 sys" }, { value: 90, label: "90 dia" }]}
        />
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-1.5">
          <Droplets className="w-4 h-4 text-medical-600" /> Blood Sugar Trend
        </h4>
        <TrendChart
          series={readings.some((r) => r.type === "sugar") ? sugarSeries(readings) : []}
          unit="mg/dL"
          thresholds={[{ value: 126, label: "126 fasting" }, { value: 200, label: "200 random" }]}
        />
      </div>

      {/* Reading log */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <h4 className="text-sm font-bold text-slate-700 mb-3">Reading Log</h4>
        {readings.length === 0 ? (
          <p className="text-sm text-slate-400">No readings logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {readings.slice(0, 30).map((r) => (
              <li key={r.id} className="py-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">{formatReading(r)}</p>
                  {r.note && <p className="text-xs text-slate-400">{r.note}</p>}
                </div>
                <p className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(r.recorded_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Main section ───────────────────────────────────────────────────────────────

export function DoctorMonitoringSection() {
  const [patients, setPatients] = useState<PanelPatient[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([
        fetch("/api/doc-login/monitoring/patients", { cache: "no-store" }),
        fetch("/api/doc-login/monitoring/alerts?status=open&limit=20", { cache: "no-store" }),
      ]);
      const pData = await pRes.json();
      const aData = await aRes.json();
      if (pData.success) setPatients(pData.patients);
      if (aData.success) setAlerts(aData.alerts);
    } catch { toast.error("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function acknowledge(alertId: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/doc-login/monitoring/alerts/${alertId}`, { method: "PATCH" });
      if (!res.ok) { toast.error("Failed to acknowledge"); return; }
      load();
    } catch { toast.error("Network error"); }
    finally { setBusy(false); }
  }

  if (selectedId) {
    return <PatientDetail memberId={selectedId} onBack={() => setSelectedId(null)} onChanged={load} />;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    );
  }

  const shown = patients.filter((p) => {
    if (onlyFlagged && !p.flagged) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.email.includes(q) ||
      p.policy_number.toLowerCase().includes(q) ||
      p.hmo_name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Open alert feed */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-amber-500" /> Open Alerts
          </h4>
          {alerts.length > 0 && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{alerts.length}</span>
          )}
          <button onClick={load} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-400">No open alerts — all patients within range.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {alerts.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <button onClick={() => a.member && setSelectedId(a.member.id)}
                    className="text-sm font-semibold text-slate-700 hover:text-medical-700 transition">
                    {a.member?.full_name}
                  </button>
                  <span className="text-xs text-slate-400 ml-2">{a.member?.hmo.name}</span>
                  <p className="text-sm text-slate-600 flex items-center gap-2 flex-wrap mt-0.5">
                    <SeverityBadge severity={a.severity} /> {a.message}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{timeAgo(a.created_at)}</p>
                </div>
                <button disabled={busy} onClick={() => acknowledge(a.id)}
                  className="flex items-center gap-1 text-xs font-semibold text-medical-600 hover:text-medical-700 border border-medical-200 hover:border-medical-300 px-2.5 py-1.5 rounded-lg transition shrink-0">
                  <Check className="w-3 h-3" /> Acknowledge
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Patient panel */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <HeartPulse className="w-4 h-4 text-medical-600" /> Monitored Patients
          </h4>
          <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{patients.length}</span>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)}
              className="rounded border-slate-300 text-medical-600 focus:ring-medical-400" />
            Flagged only
          </label>
        </div>
        <div className="relative mb-3">
          <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, policy number or HMO…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition" />
        </div>

        {shown.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {patients.length === 0 ? "No patients assigned to you yet." : "No patients match your filters."}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="text-left font-semibold py-2 pr-3">Patient</th>
                  <th className="text-left font-semibold py-2 pr-3">Latest BP</th>
                  <th className="text-left font-semibold py-2 pr-3">Latest Sugar</th>
                  <th className="text-left font-semibold py-2 pr-3">Alerts</th>
                  <th className="text-left font-semibold py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {shown.map((p) => (
                  <tr key={p.id} onClick={() => setSelectedId(p.id)}
                    className="cursor-pointer hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 pr-3">
                      <p className="font-semibold text-slate-700 flex items-center gap-1.5">
                        {p.flagged && <Flag className="w-3 h-3 text-red-500" />}
                        {p.full_name}
                      </p>
                      <p className="text-slate-400">{p.hmo_name} · {p.policy_number}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">
                      {p.latest_bp ? (
                        <>
                          {p.latest_bp.systolic}/{p.latest_bp.diastolic}
                          <span className="block text-slate-400">{timeAgo(p.latest_bp.recorded_at)}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600 whitespace-nowrap">
                      {p.latest_sugar ? (
                        <>
                          {Number(p.latest_sugar.glucose_mg_dl)} mg/dL
                          <span className="block text-slate-400">{timeAgo(p.latest_sugar.recorded_at)}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {p.open_alerts > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          <Bell className="w-3 h-3" /> {p.open_alerts}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {p.flagged
                        ? <span className="text-red-600 font-semibold">Flagged</span>
                        : <span className="text-emerald-600">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
