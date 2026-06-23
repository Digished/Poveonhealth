"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  ArrowLeft, ShieldAlert, Pencil, Check, X, PlayCircle,
  ClipboardList, Activity, Stethoscope, Pill, FlaskConical, BedDouble, CircleCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { describeRxItem, type ParsedRxItem } from "@/lib/emr/prescription";

interface Patient {
  id: string; hospital_number: string; full_name: string; age: number | null; sex: string | null;
  phone: string | null; email: string | null; address: string | null; city: string | null; state: string | null;
  occupation: string | null; marital_status: string | null; blood_group: string | null; genotype: string | null;
  allergies: string | null; known_conditions: string | null;
  next_of_kin_name: string | null; next_of_kin_relationship: string | null; next_of_kin_phone: string | null; next_of_kin_address: string | null;
  insurance_provider: string | null; insurance_number: string | null;
}
interface Encounter { id: string; type: string; status: string; chief_complaint: string | null; created_at: string; closed_at: string | null; }
interface Vital { id: string; encounter_id: string; temperature: number | null; systolic: number | null; diastolic: number | null; pulse: number | null; spo2: number | null; recorded_at: string; }
interface Note { id: string; encounter_id: string; status: string; signed_at: string | null; }
interface Rx { id: string; encounter_id: string; status: string; created_at: string; items: ParsedRxItem[]; }
interface Lab { id: string; encounter_id: string; status: string; created_at: string; tests: { test_name: string; result_value: string | null; flag: string | null }[]; }
interface Admission { id: string; encounter_id: string; ward_name: string; bed_label: string | null; status: string; admitted_at: string; }

interface Record {
  patient: Patient; encounters: Encounter[]; vitals: Vital[]; notes: Note[];
  prescriptions: Rx[]; lab_orders: Lab[]; admissions: Admission[];
}

const STEP_ICON = [ClipboardList, Activity, Stethoscope, Pill, BedDouble];

export function PatientDetail({ patientId, onBack }: { patientId: string; onBack: () => void }) {
  const [rec, setRec] = useState<Record | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/emr/patients/${patientId}`);
      const data = await res.json();
      if (res.ok) setRec(data);
      else toast.error(data.error ?? "Failed to load record.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  async function startVisit() {
    const res = await fetch("/api/emr/onboarding", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: patientId }),
    });
    if (res.ok) { toast.success("New visit started — patient is in the Vitals queue."); await load(); }
    else { const d = await res.json(); toast.error(d.error ?? "Failed to start visit."); }
  }

  if (loading) return <div className="py-20 text-center text-sm text-slate-400">Loading record…</div>;
  if (!rec) return null;

  if (editing) {
    return <EditPatient patient={rec.patient} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />;
  }

  const p = rec.patient;
  const hasOpenVisit = rec.encounters.some((e) => e.status !== "closed");

  return (
    <div className="space-y-3 pb-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500"><ArrowLeft className="w-4 h-4" /> Patients</button>

      {/* Header card */}
      <div className="bg-gradient-to-br from-medical-600 to-medical-800 rounded-2xl p-4 text-white shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{p.full_name}</p>
            <p className="text-xs text-white/70 font-mono">{p.hospital_number}</p>
          </div>
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-semibold bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1.5 shrink-0"><Pencil className="w-3.5 h-3.5" /> Edit</button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/90">
          <span>{p.age ?? "—"} yrs</span><span>{p.sex ?? "—"}</span>
          {p.blood_group && <span>Blood {p.blood_group}</span>}
          {p.genotype && <span>Genotype {p.genotype}</span>}
          {p.phone && <span>{p.phone}</span>}
        </div>
        {p.allergies && <div className="mt-2 flex items-center gap-1.5 text-xs bg-amber-400/20 text-amber-50 rounded-lg px-2 py-1"><ShieldAlert className="w-3.5 h-3.5" /> Allergies: {p.allergies}</div>}
      </div>

      {!hasOpenVisit && (
        <Button onClick={startVisit} fullWidth size="sm"><PlayCircle className="w-4 h-4" /> Start new visit</Button>
      )}

      {/* Journey */}
      <Section title="Journey" count={rec.encounters.length}>
        {rec.encounters.length === 0 ? <Empty /> : (
          <div className="space-y-3">
            {rec.encounters.map((e) => (
              <JourneyCard
                key={e.id}
                encounter={e}
                vitals={rec.vitals.filter((v) => v.encounter_id === e.id)}
                notes={rec.notes.filter((n) => n.encounter_id === e.id)}
                rx={rec.prescriptions.filter((r) => r.encounter_id === e.id)}
                labs={rec.lab_orders.filter((l) => l.encounter_id === e.id)}
                admissions={rec.admissions.filter((a) => a.encounter_id === e.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Demographics */}
      <Section title="Details">
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <Field label="Address" value={p.address} />
          <Field label="City" value={p.city} />
          <Field label="Occupation" value={p.occupation} />
          <Field label="Marital status" value={p.marital_status} />
          <Field label="Known conditions" value={p.known_conditions} />
          <Field label="Email" value={p.email} />
          <Field label="Next of kin" value={p.next_of_kin_name ? `${p.next_of_kin_name}${p.next_of_kin_relationship ? ` (${p.next_of_kin_relationship})` : ""}` : null} />
          <Field label="NOK phone" value={p.next_of_kin_phone} />
          <Field label="Insurer" value={p.insurance_provider} />
          <Field label="Insurance no." value={p.insurance_number} />
        </div>
      </Section>
    </div>
  );
}

function JourneyCard({ encounter, vitals, notes, rx, labs, admissions }: {
  encounter: Encounter; vitals: Vital[]; notes: Note[]; rx: Rx[]; labs: Lab[]; admissions: Admission[];
}) {
  // Derive which stages this visit reached.
  const reached = {
    onboarded: true,
    vitals: vitals.length > 0,
    consult: notes.length > 0,
    pharmacy: rx.length > 0,
    ward: admissions.length > 0,
  };
  const steps = [
    { key: "onboarded", label: "Onboarded", done: reached.onboarded },
    { key: "vitals", label: "Vitals", done: reached.vitals },
    { key: "consult", label: "Consult", done: reached.consult },
    { key: "pharmacy", label: rx.length || !labs.length ? "Pharmacy" : "Lab", done: reached.pharmacy || labs.length > 0 },
    { key: "ward", label: encounter.status === "closed" ? "Closed" : "Ward", done: reached.ward || encounter.status === "closed" },
  ];

  return (
    <div className="border border-slate-100 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700 truncate">{encounter.chief_complaint || encounter.type}</p>
        <span className="text-[10px] text-slate-400 shrink-0">{new Date(encounter.created_at).toLocaleDateString()}</span>
      </div>

      {/* Step trail */}
      <div className="flex items-center gap-1 mb-2">
        {steps.map((s, i) => {
          const Icon = STEP_ICON[i] ?? CircleCheck;
          return (
            <div key={s.key} className="flex items-center gap-1 flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-0.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${s.done ? "bg-medical-600 text-white" : "bg-slate-100 text-slate-300"}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className={`text-[9px] ${s.done ? "text-slate-600 font-medium" : "text-slate-300"}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 rounded ${steps[i + 1].done ? "bg-medical-300" : "bg-slate-100"}`} />}
            </div>
          );
        })}
      </div>

      {/* Quick counts */}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <StatusPill status={encounter.status} />
        {vitals.length > 0 && <Tag icon={<Activity className="w-3 h-3" />}>{vitals.length} vitals</Tag>}
        {rx.length > 0 && <Tag icon={<Pill className="w-3 h-3" />}>{rx.reduce((n, r) => n + r.items.length, 0)} drug(s)</Tag>}
        {labs.length > 0 && <Tag icon={<FlaskConical className="w-3 h-3" />}>{labs.reduce((n, l) => n + l.tests.length, 0)} test(s)</Tag>}
      </div>

      {/* Latest detail snippets */}
      {rx.length > 0 && (
        <ul className="mt-2 text-[11px] text-slate-500 space-y-0.5">
          {rx[0].items.slice(0, 4).map((it, i) => <li key={i}>• {describeRxItem(it)}</li>)}
        </ul>
      )}
    </div>
  );
}

function EditPatient({ patient, onCancel, onSaved }: { patient: Patient; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: patient.full_name ?? "", age: patient.age?.toString() ?? "", sex: patient.sex ?? "",
    phone: patient.phone ?? "", email: patient.email ?? "", address: patient.address ?? "", city: patient.city ?? "",
    state: patient.state ?? "", occupation: patient.occupation ?? "", marital_status: patient.marital_status ?? "",
    blood_group: patient.blood_group ?? "", genotype: patient.genotype ?? "", allergies: patient.allergies ?? "",
    known_conditions: patient.known_conditions ?? "", next_of_kin_name: patient.next_of_kin_name ?? "",
    next_of_kin_relationship: patient.next_of_kin_relationship ?? "", next_of_kin_phone: patient.next_of_kin_phone ?? "",
    next_of_kin_address: patient.next_of_kin_address ?? "", insurance_provider: patient.insurance_provider ?? "",
    insurance_number: patient.insurance_number ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none";

  async function save() {
    if (!form.full_name.trim()) return toast.error("Name is required.");
    setSaving(true);
    try {
      const res = await fetch(`/api/emr/patients/${patient.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (res.ok) { toast.success("Patient updated."); onSaved(); }
      else { const d = await res.json(); toast.error(d.error ?? "Failed."); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pb-24">
      <button onClick={onCancel} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500"><X className="w-4 h-4" /> Cancel edit</button>
      <EditGroup title="Identity">
        <EField label="Full name"><input className={cls} value={form.full_name} onChange={set("full_name")} /></EField>
        <div className="grid grid-cols-2 gap-2">
          <EField label="Age"><input className={cls} inputMode="numeric" value={form.age} onChange={set("age")} /></EField>
          <EField label="Sex"><select className={cls} value={form.sex} onChange={set("sex")}><option value="">—</option><option>Male</option><option>Female</option></select></EField>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <EField label="Phone"><input className={cls} value={form.phone} onChange={set("phone")} /></EField>
          <EField label="Email"><input className={cls} value={form.email} onChange={set("email")} /></EField>
        </div>
        <EField label="Address"><input className={cls} value={form.address} onChange={set("address")} /></EField>
        <div className="grid grid-cols-2 gap-2">
          <EField label="City"><input className={cls} value={form.city} onChange={set("city")} /></EField>
          <EField label="State"><input className={cls} value={form.state} onChange={set("state")} /></EField>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <EField label="Occupation"><input className={cls} value={form.occupation} onChange={set("occupation")} /></EField>
          <EField label="Marital status"><select className={cls} value={form.marital_status} onChange={set("marital_status")}><option value="">—</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></EField>
        </div>
      </EditGroup>
      <EditGroup title="Clinical baseline">
        <div className="grid grid-cols-2 gap-2">
          <EField label="Blood group"><select className={cls} value={form.blood_group} onChange={set("blood_group")}><option value="">—</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(b=><option key={b}>{b}</option>)}</select></EField>
          <EField label="Genotype"><select className={cls} value={form.genotype} onChange={set("genotype")}><option value="">—</option>{["AA","AS","SS","AC","SC"].map(g=><option key={g}>{g}</option>)}</select></EField>
        </div>
        <EField label="Allergies"><input className={cls} value={form.allergies} onChange={set("allergies")} /></EField>
        <EField label="Known conditions"><input className={cls} value={form.known_conditions} onChange={set("known_conditions")} /></EField>
      </EditGroup>
      <EditGroup title="Next of kin">
        <EField label="Name"><input className={cls} value={form.next_of_kin_name} onChange={set("next_of_kin_name")} /></EField>
        <div className="grid grid-cols-2 gap-2">
          <EField label="Relationship"><input className={cls} value={form.next_of_kin_relationship} onChange={set("next_of_kin_relationship")} /></EField>
          <EField label="Phone"><input className={cls} value={form.next_of_kin_phone} onChange={set("next_of_kin_phone")} /></EField>
        </div>
        <EField label="Address"><input className={cls} value={form.next_of_kin_address} onChange={set("next_of_kin_address")} /></EField>
      </EditGroup>
      <EditGroup title="Insurance">
        <div className="grid grid-cols-2 gap-2">
          <EField label="Provider"><input className={cls} value={form.insurance_provider} onChange={set("insurance_provider")} /></EField>
          <EField label="Number"><input className={cls} value={form.insurance_number} onChange={set("insurance_number")} /></EField>
        </div>
      </EditGroup>

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-slate-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Button onClick={save} loading={saving} fullWidth><Check className="w-4 h-4" /> Save changes</Button>
          <Button onClick={onCancel} variant="ghost">Cancel</Button>
        </div>
      </div>
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
function EditGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3"><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>{children}</div>;
}
function EField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[11px] font-semibold text-slate-500 mb-1 block">{label}</label>{children}</div>;
}
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div><span className="text-slate-400">{label}: </span><span className="font-medium text-slate-700">{value}</span></div>;
}
function Empty() { return <p className="text-xs text-slate-400">Nothing recorded yet.</p>; }
function Tag({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-500 rounded-full px-2 py-0.5">{icon}{children}</span>;
}
function StatusPill({ status }: { status: string }) {
  const color = /closed|dispensed|resulted|discharged/.test(status) ? "bg-slate-100 text-slate-500"
    : /pending|ordered|waiting/.test(status) ? "bg-amber-50 text-amber-600"
    : "bg-medical-50 text-medical-600";
  return <span className={`inline-flex items-center font-semibold px-1.5 py-0.5 rounded ${color}`}>{status.replace(/_/g, " ")}</span>;
}
