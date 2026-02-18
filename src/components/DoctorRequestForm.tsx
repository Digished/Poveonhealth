"use client";

import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { FlaskConical, User, Calendar, MapPin, Mail, Phone, Stethoscope, TestTube2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { SuccessScreen } from "@/components/SuccessScreen";
import type { Lab, CreateRequestResponse } from "@/lib/types";

interface FormData {
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
  lab_id: string;
}

const INITIAL: FormData = {
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
  lab_id: "",
};

export function DoctorRequestForm() {
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
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validate(): boolean {
    const errs: Partial<FormData> = {};
    if (!form.patient_name.trim()) errs.patient_name = "Required";
    if (!form.dob) errs.dob = "Required";
    if (!form.sex) errs.sex = "Required";
    if (!form.address.trim()) errs.address = "Required";
    if (!form.doctor_name.trim()) errs.doctor_name = "Required";
    if (!form.doctor_email.trim()) errs.doctor_email = "Required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.doctor_email))
      errs.doctor_email = "Invalid email";
    if (form.patient_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.patient_email))
      errs.patient_email = "Invalid email";
    if (!form.tests.trim()) errs.tests = "Required";
    if (!form.lab_id) errs.lab_id = "Please select a laboratory";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
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
        onReset={() => {
          setResult(null);
          setForm(INITIAL);
        }}
      />
    );
  }

  const labOptions = labs.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-medical-600 rounded-2xl mb-4 shadow-lg">
          <FlaskConical className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">
          Laboratory Request
        </h1>
        <p className="text-slate-500 text-base max-w-md mx-auto">
          Submit a laboratory test request for your patient. No account required.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* Patient Information */}
        <section className="glass-card p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 mb-5 pb-3 border-b border-slate-100">
            <User className="w-4 h-4 text-medical-600" />
            Patient Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Patient Full Name"
                required
                placeholder="e.g. Amara Okonkwo"
                value={form.patient_name}
                onChange={(e) => set("patient_name", e.target.value)}
                error={errors.patient_name}
              />
            </div>
            <div className="relative">
              <Input
                label="Date of Birth"
                type="date"
                required
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
                error={errors.dob}
              />
            </div>
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
            <div className="sm:col-span-2">
              <Input
                label="Patient Address"
                required
                placeholder="Home address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                error={errors.address}
              />
            </div>
            <div className="sm:col-span-2">
              <Input
                label="Patient Email"
                type="email"
                placeholder="patient@example.com"
                hint="If provided, the patient will receive their code by email"
                value={form.patient_email}
                onChange={(e) => set("patient_email", e.target.value)}
                error={errors.patient_email}
              />
            </div>
          </div>
        </section>

        {/* Doctor Information */}
        <section className="glass-card p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 mb-5 pb-3 border-b border-slate-100">
            <Stethoscope className="w-4 h-4 text-medical-600" />
            Referring Physician
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Doctor Name"
                required
                placeholder="Dr. Firstname Lastname"
                value={form.doctor_name}
                onChange={(e) => set("doctor_name", e.target.value)}
                error={errors.doctor_name}
              />
            </div>
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
        </section>

        {/* Clinical Details */}
        <section className="glass-card p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-700 mb-5 pb-3 border-b border-slate-100">
            <TestTube2 className="w-4 h-4 text-medical-600" />
            Clinical Details
          </h2>
          <div className="space-y-4">
            <Select
              label="Destination Laboratory"
              required
              value={form.lab_id}
              onChange={(e) => set("lab_id", e.target.value)}
              placeholder={labsLoading ? "Loading laboratories..." : "Select a laboratory"}
              options={labOptions}
              disabled={labsLoading}
              error={errors.lab_id}
            />
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
          </div>
        </section>

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          fullWidth
          className="text-base py-4 rounded-2xl shadow-xl shadow-medical-500/20"
        >
          <FlaskConical className="w-5 h-5" />
          Generate Lab Request
        </Button>

        <p className="text-center text-xs text-slate-400">
          By submitting, you confirm you are authorised to request these tests on behalf of the patient.
        </p>
      </form>
    </div>
  );
}
