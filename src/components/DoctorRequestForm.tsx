"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import {
  FlaskConical, User, MapPin, Phone, Stethoscope,
  TestTube2, ChevronRight, ChevronLeft, Building2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SuccessScreen } from "@/components/SuccessScreen";
import type { Lab, CreateRequestResponse } from "@/lib/types";

interface FormData {
  lab_id: string;
  patient_name: string;
  dob: string;
  sex: string;
  address: string;
  patient_email: string;
  doctor_name: string;
  doctor_email: string;
  doctor_phone: string;
  diagnosis: string;
  tests: string;
}

const INITIAL: FormData = {
  lab_id: "",
  patient_name: "",
  dob: "",
  sex: "",
  address: "",
  patient_email: "",
  doctor_name: "",
  doctor_email: "",
  doctor_phone: "",
  diagnosis: "",
  tests: "",
};

const STEPS = [
  { title: "Laboratory", icon: Building2 },
  { title: "Patient", icon: User },
  { title: "Contact", icon: Phone },
  { title: "Physician", icon: Stethoscope },
  { title: "Tests", icon: TestTube2 },
];

function SummaryRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex justify-between text-xs gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className={`text-slate-700 font-medium text-right ${capitalize ? "capitalize" : ""}`}>{value || "—"}</span>
    </div>
  );
}

export function DoctorRequestForm() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [labs, setLabs] = useState<Lab[]>([]);
  const [labsLoading, setLabsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreateRequestResponse | null>(null);

  useEffect(() => {
    fetch("/api/labs")
      .then((r) => r.json())
      .then((data) => setLabs(data.labs ?? []))
      .catch(() => toast.error("Failed to load laboratories"))
      .finally(() => setLabsLoading(false));
  }, []);

  function set(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validateStep(s: number): boolean {
    const errs: Partial<FormData> = {};
    if (s === 1 && !form.lab_id) errs.lab_id = "Please select a laboratory";
    if (s === 2) {
      if (!form.patient_name.trim()) errs.patient_name = "Required";
      if (!form.dob) errs.dob = "Required";
      if (!form.sex) errs.sex = "Required";
    }
    if (s === 3 && form.patient_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email))
      errs.patient_email = "Invalid email";
    if (s === 4) {
      if (!form.doctor_name.trim()) errs.doctor_name = "Required";
      if (!form.doctor_email.trim()) errs.doctor_email = "Required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.doctor_email))
        errs.doctor_email = "Invalid email";
    }
    if (s === 5 && !form.tests.trim()) errs.tests = "Required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (validateStep(step)) setStep((s) => Math.min(5, s + 1));
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit() {
    if (!validateStep(5)) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: CreateRequestResponse = await res.json();
      if (data.success) {
        setResult(data);
      } else {
        toast.error(data.error ?? "Failed to submit request");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.success) {
    return (
      <SuccessScreen
        code={result.code!}
        labName={result.lab?.name ?? ""}
        labAddresses={result.lab?.addresses ?? []}
        labPhones={result.lab?.phones ?? []}
        onReset={() => { setResult(null); setForm(INITIAL); setStep(1); }}
      />
    );
  }

  const selectedLab = labs.find((l) => l.id === form.lab_id);
  const labOptions = labs.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-medical-600 rounded-2xl mb-4 shadow-lg">
          <FlaskConical className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">
          Laboratory Request
        </h1>
        <p className="text-slate-500 text-base max-w-md mx-auto">
          Submit a lab test request for your patient. No account required.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {STEPS.map((s, i) => {
          const num = i + 1;
          const done = num < step;
          const active = num === step;
          const Icon = s.icon;
          return (
            <div key={s.title} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  done ? "bg-medical-600 text-white" :
                  active ? "bg-medical-600 text-white ring-4 ring-medical-100" :
                  "bg-slate-100 text-slate-400"
                }`}>
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <p className={`text-xs mt-1 font-medium hidden sm:block whitespace-nowrap ${
                  active ? "text-medical-600" : done ? "text-slate-500" : "text-slate-400"
                }`}>
                  {s.title}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-4 rounded transition-all ${done ? "bg-medical-400" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="glass-card p-6 mb-5">

        {/* Step 1: Choose Lab */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-medical-600" />
              Select Laboratory
            </h2>
            <Select
              label="Destination Laboratory"
              required
              value={form.lab_id}
              onChange={(e) => set("lab_id", e.target.value)}
              placeholder={labsLoading ? "Loading laboratories…" : "Select a laboratory"}
              options={labOptions}
              disabled={labsLoading}
              error={errors.lab_id}
            />
            {selectedLab && (
              <div className="bg-medical-50 border border-medical-100 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-medical-800">{selectedLab.name}</p>
                {selectedLab.addresses.map((addr, i) => (
                  <p key={i} className="text-xs text-medical-600 flex items-start gap-1.5">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />{addr}
                  </p>
                ))}
                {selectedLab.phones.length > 0 && selectedLab.phones.map((ph, i) => (
                  <p key={i} className="text-xs text-medical-600 flex items-center gap-1.5">
                    <Phone className="w-3 h-3 shrink-0" />{ph}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Patient Information */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <User className="w-4 h-4 text-medical-600" />
              Patient Information
            </h2>
            <Input
              label="Patient Full Name"
              required
              placeholder="e.g. Amara Okonkwo"
              value={form.patient_name}
              onChange={(e) => set("patient_name", e.target.value)}
              error={errors.patient_name}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Date of Birth"
                type="date"
                required
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
                error={errors.dob}
              />
              <Select
                label="Sex"
                required
                value={form.sex}
                onChange={(e) => set("sex", e.target.value)}
                placeholder="Select sex"
                options={[
                  { value: "male", label: "Male" },
                  { value: "female", label: "Female" },
                ]}
                error={errors.sex}
              />
            </div>
          </div>
        )}

        {/* Step 3: Contact Details (all optional) */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <Phone className="w-4 h-4 text-medical-600" />
              Patient Contact Details
            </h2>
            <p className="text-xs text-slate-400 -mt-1">All fields on this step are optional.</p>
            <Input
              label="Patient Address"
              placeholder="Home address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
            <Input
              label="Patient Email"
              type="email"
              placeholder="patient@example.com"
              hint="Patient will receive their request code by email"
              value={form.patient_email}
              onChange={(e) => set("patient_email", e.target.value)}
              error={errors.patient_email}
            />
          </div>
        )}

        {/* Step 4: Referring Physician */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <Stethoscope className="w-4 h-4 text-medical-600" />
              Referring Physician
            </h2>
            <Input
              label="Doctor Name"
              required
              placeholder="Dr. Firstname Lastname"
              value={form.doctor_name}
              onChange={(e) => set("doctor_name", e.target.value)}
              error={errors.doctor_name}
            />
            <Input
              label="Doctor Email"
              type="email"
              required
              placeholder="doctor@hospital.com"
              hint="You will receive request updates here"
              value={form.doctor_email}
              onChange={(e) => set("doctor_email", e.target.value)}
              error={errors.doctor_email}
            />
            <Input
              label="Doctor Phone"
              type="tel"
              placeholder="+234 800 000 0000"
              value={form.doctor_phone}
              onChange={(e) => set("doctor_phone", e.target.value)}
            />
          </div>
        )}

        {/* Step 5: Clinical Details + Review */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 pb-3 border-b border-slate-100">
              <TestTube2 className="w-4 h-4 text-medical-600" />
              Clinical Details
            </h2>
            <Textarea
              label="Diagnosis / Clinical Notes"
              placeholder="Brief clinical summary or working diagnosis…"
              rows={3}
              value={form.diagnosis}
              onChange={(e) => set("diagnosis", e.target.value)}
            />
            <Textarea
              label="Laboratory Tests Requested"
              required
              placeholder="e.g. FBC, LFT, Serum electrolytes, Fasting glucose, Urinalysis…"
              rows={4}
              hint="List all tests separated by commas or new lines"
              value={form.tests}
              onChange={(e) => set("tests", e.target.value)}
              error={errors.tests}
            />
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-100">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Review</p>
              <SummaryRow label="Lab" value={selectedLab?.name ?? ""} />
              <SummaryRow label="Patient" value={form.patient_name} />
              <SummaryRow label="Date of Birth" value={form.dob} />
              <SummaryRow label="Sex" value={form.sex} capitalize />
              <SummaryRow label="Doctor" value={form.doctor_name} />
              <SummaryRow label="Doctor Email" value={form.doctor_email} />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className={`flex gap-3 ${step === 1 ? "justify-end" : "justify-between"}`}>
        {step > 1 && (
          <Button variant="ghost" onClick={handleBack} type="button">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        )}
        {step < 5 ? (
          <Button onClick={handleNext} type="button">
            Continue
            <ChevronRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            loading={submitting}
            size="lg"
            className="shadow-xl shadow-medical-500/20"
          >
            <FlaskConical className="w-5 h-5" />
            Generate Lab Request
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-slate-400 mt-4">
        By submitting, you confirm you are authorised to request these tests on behalf of the patient.
      </p>
    </div>
  );
}
