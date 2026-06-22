"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { Search, X, User, Phone, ShieldAlert, ArrowLeft } from "lucide-react";
import { describeRxItem, type ParsedRxItem } from "@/lib/emr/prescription";
import type { EmrPatient } from "./emrTypes";

interface FullRecord {
  patient: EmrPatient & {
    address: string | null; next_of_kin_relationship: string | null;
    next_of_kin_address: string | null; known_conditions: string | null;
    marital_status: string | null; occupation: string | null;
    insurance_provider: string | null; insurance_number: string | null;
  };
  encounters: { id: string; type: string; status: string; chief_complaint: string | null; created_at: string }[];
  vitals: { id: string; temperature: number | null; systolic: number | null; diastolic: number | null; pulse: number | null; spo2: number | null; recorded_at: string }[];
  notes: { id: string; content: { type: string; text?: string }[]; status: string; updated_at: string }[];
  prescriptions: { id: string; status: string; created_at: string; items: ParsedRxItem[] }[];
  lab_orders: { id: string; status: string; created_at: string; tests: { test_name: string; result_value: string | null; flag: string | null }[] }[];
  admissions: { id: string; ward_name: string; bed_label: string | null; status: string; admitted_at: string }[];
}

export function PatientsTab() {
  const [patients, setPatients] = useState<EmrPatient[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<FullRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hospital/emr/patients?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok) setPatients(data.patients);
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  async function openRecord(id: string) {
    setLoadingRecord(true);
    try {
      const res = await fetch(`/api/hospital/emr/patients/${id}`);
      const data = await res.json();
      if (res.ok) setRecord(data);
      else toast.error(data.error ?? "Failed to load record.");
    } finally {
      setLoadingRecord(false);
    }
  }

  if (record) {
    return <PatientRecord record={record} onBack={() => setRecord(null)} />;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, hospital no. or phone"
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 py-2.5 text-sm focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none"
        />
        {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
      </div>

      {loadingRecord && <p className="text-center text-sm text-slate-400 py-4">Opening record…</p>}

      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />)}</div>
      ) : patients.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">{q ? "No patients match your search." : "No patients yet. Onboarding will register them."}</p>
      ) : (
        <div className="space-y-2">
          {patients.map((p) => (
            <button key={p.id} onClick={() => openRecord(p.id)} className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex items-center gap-3 hover:border-medical-200 transition">
              <div className="w-9 h-9 rounded-full bg-medical-50 text-medical-600 flex items-center justify-center shrink-0"><User className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                <p className="text-[11px] text-slate-400 font-mono">{p.hospital_number} · {p.age ?? "—"}{p.sex ? `${p.sex.charAt(0).toUpperCase()}` : ""}</p>
              </div>
              {p.allergies && <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />}
              {p.phone && <span className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0"><Phone className="w-3 h-3" />{p.phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{title}{count != null && ` · ${count}`}</p>
      {children}
    </div>
  );
}

function PatientRecord({ record, onBack }: { record: FullRecord; onBack: () => void }) {
  const p = record.patient;
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> Back to patients
      </button>

      <div className="bg-gradient-to-br from-medical-600 to-medical-800 rounded-2xl p-4 text-white shadow-md">
        <p className="text-lg font-bold leading-tight">{p.full_name}</p>
        <p className="text-xs text-white/70 font-mono">{p.hospital_number}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/90">
          <span>{p.age ?? "—"} yrs</span><span>{p.sex ?? "—"}</span>
          {p.blood_group && <span>Blood {p.blood_group}</span>}
          {p.genotype && <span>Genotype {p.genotype}</span>}
          {p.phone && <span>{p.phone}</span>}
        </div>
        {p.allergies && (
          <div className="mt-2 flex items-center gap-1.5 text-xs bg-amber-400/20 text-amber-50 rounded-lg px-2 py-1">
            <ShieldAlert className="w-3.5 h-3.5" /> Allergies: {p.allergies}
          </div>
        )}
      </div>

      <Section title="Demographics">
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <Field label="Address" value={p.address} />
          <Field label="Occupation" value={p.occupation} />
          <Field label="Marital status" value={p.marital_status} />
          <Field label="Known conditions" value={p.known_conditions} />
          <Field label="Next of kin" value={p.next_of_kin_name ? `${p.next_of_kin_name}${p.next_of_kin_relationship ? ` (${p.next_of_kin_relationship})` : ""}` : null} />
          <Field label="NOK phone" value={p.next_of_kin_phone} />
          <Field label="Insurer" value={p.insurance_provider} />
          <Field label="Insurance no." value={p.insurance_number} />
        </div>
      </Section>

      <Section title="Visits" count={record.encounters.length}>
        {record.encounters.length === 0 ? <Empty /> : (
          <div className="space-y-1.5">
            {record.encounters.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{e.chief_complaint || e.type}</span>
                <span className="text-slate-400">{new Date(e.created_at).toLocaleDateString()} · <StatusPill status={e.status} /></span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Latest vitals">
        {record.vitals[0] ? (
          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
            {record.vitals[0].temperature != null && <span>Temp {record.vitals[0].temperature}°C</span>}
            {record.vitals[0].systolic != null && <span>BP {record.vitals[0].systolic}/{record.vitals[0].diastolic}</span>}
            {record.vitals[0].pulse != null && <span>Pulse {record.vitals[0].pulse}</span>}
            {record.vitals[0].spo2 != null && <span>SpO₂ {record.vitals[0].spo2}%</span>}
          </div>
        ) : <Empty />}
      </Section>

      <Section title="Prescriptions" count={record.prescriptions.length}>
        {record.prescriptions.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {record.prescriptions.map((rx) => (
              <div key={rx.id} className="border border-slate-100 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-1"><StatusPill status={rx.status} /><span className="text-[10px] text-slate-400">{new Date(rx.created_at).toLocaleDateString()}</span></div>
                <ul className="text-xs text-slate-600 space-y-0.5">{rx.items.map((it, i) => <li key={i}>• {describeRxItem(it)}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Lab orders" count={record.lab_orders.length}>
        {record.lab_orders.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {record.lab_orders.map((lo) => (
              <div key={lo.id} className="border border-slate-100 rounded-xl p-2.5">
                <div className="flex items-center justify-between mb-1"><StatusPill status={lo.status} /><span className="text-[10px] text-slate-400">{new Date(lo.created_at).toLocaleDateString()}</span></div>
                <ul className="text-xs text-slate-600 space-y-0.5">
                  {lo.tests.map((t, i) => <li key={i}>• {t.test_name}{t.result_value ? `: ${t.result_value}` : ""}{t.flag && t.flag !== "normal" ? ` (${t.flag})` : ""}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {record.admissions.length > 0 && (
        <Section title="Admissions" count={record.admissions.length}>
          <div className="space-y-1.5">
            {record.admissions.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{a.ward_name}{a.bed_label ? ` · Bed ${a.bed_label}` : ""}</span>
                <StatusPill status={a.status} />
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div><span className="text-slate-400">{label}: </span><span className="font-medium text-slate-700">{value}</span></div>;
}
function Empty() { return <p className="text-xs text-slate-400">Nothing recorded.</p>; }
function StatusPill({ status }: { status: string }) {
  const color = /closed|dispensed|resulted|discharged/.test(status) ? "bg-slate-100 text-slate-500"
    : /pending|ordered|waiting/.test(status) ? "bg-amber-50 text-amber-600"
    : "bg-medical-50 text-medical-600";
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${color}`}>{status.replace(/_/g, " ")}</span>;
}
