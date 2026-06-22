"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { Search, UserPlus, Check, X, User, ShieldAlert, Phone, Users } from "lucide-react";
import { EmrShell } from "@/components/emr/EmrShell";
import { Button } from "@/components/ui/Button";
import { PatientDetail } from "@/components/emr/PatientDetail";

interface LookupPatient {
  id: string; full_name: string; hospital_number: string;
  age: number | null; sex: string | null; phone: string | null;
}

interface ListPatient extends LookupPatient { allergies: string | null; created_at: string; }

const empty = {
  full_name: "", age: "", sex: "", phone: "", email: "", address: "", city: "", state: "",
  occupation: "", marital_status: "", blood_group: "", genotype: "", allergies: "", known_conditions: "",
  next_of_kin_name: "", next_of_kin_relationship: "", next_of_kin_phone: "", next_of_kin_address: "",
  insurance_provider: "", insurance_number: "", chief_complaint: "", type: "outpatient",
};

function OnboardingInner() {
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [reuseId, setReuseId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<LookupPatient[]>([]);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function lookup() {
    if (!search.trim()) return;
    const res = await fetch(`/api/emr/patient-lookup?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    if (res.ok) setResults(data.patients);
  }

  function pickReturning(p: LookupPatient) {
    setReuseId(p.id);
    setForm((f) => ({ ...f, full_name: p.full_name, age: p.age?.toString() ?? "", sex: p.sex ?? "", phone: p.phone ?? "" }));
    setResults([]);
    setSearch("");
    toast.success(`${p.full_name} selected`);
  }

  async function submit() {
    if (!reuseId && !form.full_name.trim()) return toast.error("Patient name is required.");
    setSaving(true);
    try {
      const res = await fetch("/api/emr/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reuseId ? { patient_id: reuseId, chief_complaint: form.chief_complaint, type: form.type } : form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed."); return; }
      toast.success("Patient sent to Vitals queue.");
      setForm({ ...empty });
      setReuseId(null);
    } finally {
      setSaving(false);
    }
  }

  const cls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";

  return (
    <div className="space-y-4 pb-24">
      {/* Returning patient search */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Returning patient?</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className={`${cls} pl-9`} placeholder="Name, hospital no. or phone" value={search}
              onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lookup()} />
          </div>
          <Button onClick={lookup} variant="ghost" size="sm">Search</Button>
        </div>
        {results.length > 0 && (
          <div className="mt-2 space-y-1">
            {results.map((p) => (
              <button key={p.id} onClick={() => pickReturning(p)} className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 text-sm">
                <span className="font-medium text-slate-700">{p.full_name}</span>
                <span className="text-xs text-slate-400 font-mono">{p.hospital_number}</span>
              </button>
            ))}
          </div>
        )}
        {reuseId && (
          <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
            <Check className="w-3.5 h-3.5" /> Returning patient selected — just add the complaint below and start the visit.
            <button onClick={() => { setReuseId(null); setForm({ ...empty }); }} className="ml-auto text-slate-400 underline">clear</button>
          </div>
        )}
      </div>

      {!reuseId && (
        <>
          <Group title="Patient details">
            <Field label="Full name" required><input className={cls} value={form.full_name} onChange={set("full_name")} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Age"><input className={cls} inputMode="numeric" value={form.age} onChange={set("age")} /></Field>
              <Field label="Sex">
                <select className={cls} value={form.sex} onChange={set("sex")}><option value="">—</option><option>Male</option><option>Female</option></select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Phone"><input className={cls} value={form.phone} onChange={set("phone")} /></Field>
              <Field label="Email"><input className={cls} value={form.email} onChange={set("email")} /></Field>
            </div>
            <Field label="Address"><input className={cls} value={form.address} onChange={set("address")} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="City"><input className={cls} value={form.city} onChange={set("city")} /></Field>
              <Field label="State"><input className={cls} value={form.state} onChange={set("state")} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Occupation"><input className={cls} value={form.occupation} onChange={set("occupation")} /></Field>
              <Field label="Marital status">
                <select className={cls} value={form.marital_status} onChange={set("marital_status")}><option value="">—</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select>
              </Field>
            </div>
          </Group>

          <Group title="Clinical baseline">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Blood group">
                <select className={cls} value={form.blood_group} onChange={set("blood_group")}><option value="">—</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(b=><option key={b}>{b}</option>)}</select>
              </Field>
              <Field label="Genotype">
                <select className={cls} value={form.genotype} onChange={set("genotype")}><option value="">—</option>{["AA","AS","SS","AC","SC"].map(g=><option key={g}>{g}</option>)}</select>
              </Field>
            </div>
            <Field label="Allergies"><input className={cls} placeholder="e.g. penicillin" value={form.allergies} onChange={set("allergies")} /></Field>
            <Field label="Known conditions"><input className={cls} placeholder="e.g. hypertension, diabetes" value={form.known_conditions} onChange={set("known_conditions")} /></Field>
          </Group>

          <Group title="Next of kin">
            <Field label="Name"><input className={cls} value={form.next_of_kin_name} onChange={set("next_of_kin_name")} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Relationship"><input className={cls} value={form.next_of_kin_relationship} onChange={set("next_of_kin_relationship")} /></Field>
              <Field label="Phone"><input className={cls} value={form.next_of_kin_phone} onChange={set("next_of_kin_phone")} /></Field>
            </div>
            <Field label="Address"><input className={cls} value={form.next_of_kin_address} onChange={set("next_of_kin_address")} /></Field>
          </Group>

          <Group title="Insurance (optional)">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Provider"><input className={cls} value={form.insurance_provider} onChange={set("insurance_provider")} /></Field>
              <Field label="Number"><input className={cls} value={form.insurance_number} onChange={set("insurance_number")} /></Field>
            </div>
          </Group>
        </>
      )}

      <Group title="This visit">
        <Field label="Chief complaint"><input className={cls} placeholder="e.g. fever and headache x 3 days" value={form.chief_complaint} onChange={set("chief_complaint")} /></Field>
        <Field label="Visit type">
          <select className={cls} value={form.type} onChange={set("type")}><option value="outpatient">Outpatient</option><option value="emergency">Emergency</option></select>
        </Field>
      </Group>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-slate-200 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <Button onClick={submit} loading={saving} fullWidth>
            <UserPlus className="w-4 h-4" /> {reuseId ? "Start visit" : "Register & start visit"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-500 mb-1 block">{label}{required && <span className="text-amber-500"> *</span>}</label>
      {children}
    </div>
  );
}

function PatientsView() {
  const [patients, setPatients] = useState<ListPatient[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/emr/patients?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok) setPatients(data.patients);
      else toast.error(data.error ?? "Failed to load patients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q, load]);

  if (openId) return <PatientDetail patientId={openId} onBack={() => { setOpenId(null); load(q); }} />;

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

      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />)}</div>
      ) : patients.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-10">{q ? "No patients match your search." : "No patients yet — register one to get started."}</p>
      ) : (
        <div className="space-y-2">
          {patients.map((p) => (
            <button key={p.id} onClick={() => setOpenId(p.id)} className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5 flex items-center gap-3 hover:border-medical-200 transition">
              <div className="w-9 h-9 rounded-full bg-medical-50 text-medical-600 flex items-center justify-center shrink-0"><User className="w-4 h-4" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.full_name}</p>
                <p className="text-[11px] text-slate-400 font-mono">{p.hospital_number} · {p.age ?? "—"}{p.sex ? p.sex.charAt(0).toUpperCase() : ""}</p>
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

function OnboardingWorkspace() {
  const [view, setView] = useState<"register" | "patients">("register");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-white/70 rounded-xl p-1 border border-slate-100 shadow-sm">
        <button onClick={() => setView("register")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition ${view === "register" ? "bg-medical-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
          <UserPlus className="w-4 h-4" /> Register
        </button>
        <button onClick={() => setView("patients")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition ${view === "patients" ? "bg-medical-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
          <Users className="w-4 h-4" /> Patients
        </button>
      </div>
      {view === "register" ? <OnboardingInner /> : <PatientsView />}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <EmrShell title="Onboarding" allow={["onboarding_clerk", "nurse", "records"]}>
      <OnboardingWorkspace />
    </EmrShell>
  );
}
