"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FlaskConical, LogOut, RefreshCw, Building2, User,
  CalendarDays, TestTube2, ChevronDown, ChevronUp,
  Clock, CheckCircle, Eye, MapPin, Phone, Mail,
  Pencil, X, Save, AlertCircle,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { toast } from "react-hot-toast";

interface Lab {
  name: string;
  address: string;
  phones: string[];
  logo_url: string | null;
}

interface Request {
  id: string;
  code: string;
  patient_name: string;
  dob: string;
  sex: string;
  address: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  doctor_prefix: string | null;
  doctor_name: string;
  doctor_phone: string | null;
  doctor_hospital: string | null;
  doctor_bank_name: string | null;
  doctor_account_number: string | null;
  doctor_account_name: string | null;
  tests: string;
  diagnosis: string | null;
  schedule: string | null;
  status: string;
  created_at: string;
  seen_at: string | null;
  completed_at: string | null;
  lab: Lab;
}

interface EditForm {
  patient_name: string;
  dob: string;
  sex: string;
  address: string;
  patient_email: string;
  patient_phone: string;
  doctor_prefix: string;
  doctor_name: string;
  doctor_phone: string;
  doctor_hospital: string;
  doctor_bank_name: string;
  doctor_account_number: string;
  doctor_account_name: string;
  schedule: string;
  diagnosis: string;
  tests: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  incoming: {
    label: "Pending",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  seen: {
    label: "Patient Arrived",
    color: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: <Eye className="w-3.5 h-3.5" />,
  },
  done: {
    label: "Completed",
    color: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
};

const SCHEDULE_LABELS: Record<string, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  not_sure: "Not Sure",
};

const PROFESSIONAL_PREFIXES = [
  "Dr.", "Prof.", "Nurse", "Pharm.", "CHEW", "CHO",
  "PT", "OT", "Optom.", "MW", "HO", "MO", "RN", "DVM",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatDob(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function toDateInputValue(iso: string) {
  return iso.slice(0, 10);
}

function EditModal({
  req,
  onClose,
  onSaved,
}: {
  req: Request;
  onClose: () => void;
  onSaved: (updated: Request) => void;
}) {
  const [form, setForm] = useState<EditForm>({
    patient_name: req.patient_name,
    dob: toDateInputValue(req.dob),
    sex: req.sex,
    address: req.address ?? "",
    patient_email: req.patient_email ?? "",
    patient_phone: req.patient_phone ?? "",
    doctor_prefix: req.doctor_prefix ?? "",
    doctor_name: req.doctor_name,
    doctor_phone: req.doctor_phone ?? "",
    doctor_hospital: req.doctor_hospital ?? "",
    doctor_bank_name: req.doctor_bank_name ?? "",
    doctor_account_number: req.doctor_account_number ?? "",
    doctor_account_name: req.doctor_account_name ?? "",
    schedule: req.schedule ?? "",
    diagnosis: req.diagnosis ?? "",
    tests: req.tests,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field: keyof EditForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSave() {
    setError("");
    if (!form.patient_name.trim()) { setError("Patient name is required."); return; }
    if (!form.dob) { setError("Date of birth is required."); return; }
    if (!form.sex) { setError("Sex is required."); return; }
    if (!form.doctor_name.trim()) { setError("Doctor name is required."); return; }
    if (!form.tests.trim()) { setError("Tests are required."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/requests/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: req.id,
          patient_name: form.patient_name.trim(),
          dob: form.dob,
          sex: form.sex,
          address: form.address.trim() || undefined,
          patient_email: form.patient_email.trim() || undefined,
          patient_phone: form.patient_phone.trim() || undefined,
          doctor_prefix: form.doctor_prefix || undefined,
          doctor_name: form.doctor_name.trim(),
          doctor_phone: form.doctor_phone.trim() || undefined,
          doctor_hospital: form.doctor_hospital.trim() || undefined,
          doctor_bank_name: form.doctor_bank_name.trim() || undefined,
          doctor_account_number: form.doctor_account_number.trim() || undefined,
          doctor_account_name: form.doctor_account_name.trim() || undefined,
          schedule: form.schedule || undefined,
          diagnosis: form.diagnosis.trim() || undefined,
          tests: form.tests.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Failed to save changes.");
        return;
      }
      toast.success("Request updated successfully.");
      // Build updated request object for optimistic UI
      const updated: Request = {
        ...req,
        patient_name: form.patient_name.trim(),
        dob: form.dob,
        sex: form.sex,
        address: form.address.trim() || null,
        patient_email: form.patient_email.trim() || null,
        patient_phone: form.patient_phone.trim() || null,
        doctor_prefix: form.doctor_prefix || null,
        doctor_name: form.doctor_name.trim(),
        doctor_phone: form.doctor_phone.trim() || null,
        doctor_hospital: form.doctor_hospital.trim() || null,
        doctor_bank_name: form.doctor_bank_name.trim() || null,
        doctor_account_number: form.doctor_account_number.trim() || null,
        doctor_account_name: form.doctor_account_name.trim() || null,
        schedule: form.schedule || null,
        diagnosis: form.diagnosis.trim() || null,
        tests: form.tests.trim(),
      };
      onSaved(updated);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <Pencil className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Edit Request</p>
            <p className="text-xs text-slate-400 font-mono">{req.code}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Editable notice */}
        <div className="mx-5 mt-4 flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Editing is only available while the request is pending (before the lab processes it).
          </p>
        </div>

        {/* Scrollable form */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Patient section */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Patient Details</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.patient_name}
                  onChange={(e) => set("patient_name", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="Patient full name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Date of Birth *</label>
                  <input
                    type="date"
                    value={form.dob}
                    onChange={(e) => set("dob", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Sex *</label>
                  <select
                    value={form.sex}
                    onChange={(e) => set("sex", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.patient_phone}
                  onChange={(e) => set("patient_phone", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="Patient phone number"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Email</label>
                <input
                  type="email"
                  value={form.patient_email}
                  onChange={(e) => set("patient_email", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="patient@email.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="Patient address"
                />
              </div>
            </div>
          </div>

          {/* Doctor section */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Doctor / Provider Details</p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Prefix</label>
                  <select
                    value={form.doctor_prefix}
                    onChange={(e) => set("doctor_prefix", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  >
                    <option value="">None</option>
                    {PROFESSIONAL_PREFIXES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={form.doctor_name}
                    onChange={(e) => set("doctor_name", e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                    placeholder="Doctor full name"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Phone</label>
                <input
                  type="tel"
                  value={form.doctor_phone}
                  onChange={(e) => set("doctor_phone", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="Doctor phone"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Hospital / Clinic</label>
                <input
                  type="text"
                  value={form.doctor_hospital}
                  onChange={(e) => set("doctor_hospital", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="Hospital or clinic name"
                />
              </div>
            </div>
          </div>

          {/* Bank details */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Bank Details (optional)</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Bank Name</label>
                <input
                  type="text"
                  value={form.doctor_bank_name}
                  onChange={(e) => set("doctor_bank_name", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="Bank name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Account Number</label>
                <input
                  type="text"
                  value={form.doctor_account_number}
                  onChange={(e) => set("doctor_account_number", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="Account number"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Account Name</label>
                <input
                  type="text"
                  value={form.doctor_account_name}
                  onChange={(e) => set("doctor_account_name", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                  placeholder="Account holder name"
                />
              </div>
            </div>
          </div>

          {/* Tests & diagnosis */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Tests & Diagnosis</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Tests Requested *</label>
                <textarea
                  value={form.tests}
                  onChange={(e) => set("tests", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition resize-none"
                  placeholder="List of tests requested"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Diagnosis / Notes</label>
                <textarea
                  value={form.diagnosis}
                  onChange={(e) => set("diagnosis", e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition resize-none"
                  placeholder="Clinical notes or diagnosis"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Preferred Schedule</label>
                <select
                  value={form.schedule}
                  onChange={(e) => set("schedule", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                >
                  <option value="">Not specified</option>
                  <option value="today">Today</option>
                  <option value="this_week">This Week</option>
                  <option value="this_month">This Month</option>
                  <option value="not_sure">Not Sure</option>
                </select>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm transition shadow-sm"
          >
            {saving ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.373 0 0 12h4z" />
              </svg>
            ) : (
              <><Save className="w-4 h-4" /> Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestCard({
  req,
  onEditClick,
}: {
  req: Request;
  onEditClick: (req: Request) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.incoming;
  const phones = Array.isArray(req.lab.phones) ? req.lab.phones : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-slate-50/60 transition"
      >
        {/* Lab logo / icon */}
        <div className="shrink-0 mt-0.5">
          {req.lab.logo_url ? (
            <img src={req.lab.logo_url} alt={req.lab.name} className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-100" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-medical-50 border border-medical-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-medical-500" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">{req.code}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>
              {status.icon}{status.label}
            </span>
          </div>
          <p className="text-sm font-bold text-slate-800 mt-0.5 truncate">{req.lab.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <User className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 truncate">{req.patient_name}</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400">{formatDate(req.created_at)}</span>
          </div>
        </div>

        <div className="shrink-0 text-slate-400 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/40">
          {/* Patient details */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Patient</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Name</span>
                <span className="text-slate-700 font-medium">{req.patient_name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Date of Birth</span>
                <span className="text-slate-700 font-medium">{formatDob(req.dob)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Sex</span>
                <span className="text-slate-700 font-medium capitalize">{req.sex}</span>
              </div>
              {req.patient_phone && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Phone</span>
                  <a href={`tel:${req.patient_phone}`} className="text-medical-600 font-medium">{req.patient_phone}</a>
                </div>
              )}
              {req.patient_email && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Email</span>
                  <span className="text-slate-700 font-medium break-all">{req.patient_email}</span>
                </div>
              )}
              {req.address && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Address</span>
                  <span className="text-slate-700 font-medium">{req.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tests */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tests Requested</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{req.tests}</p>
          </div>

          {req.diagnosis && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Diagnosis / Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed">{req.diagnosis}</p>
            </div>
          )}

          {/* Schedule */}
          {req.schedule && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-medical-500" />
              <span className="text-xs text-slate-500">Preferred schedule:</span>
              <span className="text-xs font-semibold text-slate-700">{SCHEDULE_LABELS[req.schedule] ?? req.schedule}</span>
            </div>
          )}

          {/* Lab details */}
          <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Laboratory</p>
            <p className="text-sm font-bold text-slate-800">{req.lab.name}</p>
            {req.lab.address && (
              <div className="flex items-start gap-1.5 text-xs text-slate-500">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />{req.lab.address}
              </div>
            )}
            {phones.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Phone className="w-3 h-3 shrink-0" />
                {phones.map((p, i) => (
                  <a key={i} href={`tel:${p}`} className="text-medical-600 font-medium">{p}</a>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Timeline</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-slate-500">
                <Clock className="w-3 h-3 text-slate-300 shrink-0" />
                <span>Submitted:</span>
                <span className="text-slate-700 font-medium">{formatDate(req.created_at)}</span>
              </div>
              {req.seen_at && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Eye className="w-3 h-3 text-blue-400 shrink-0" />
                  <span>Patient arrived:</span>
                  <span className="text-slate-700 font-medium">{formatDate(req.seen_at)}</span>
                </div>
              )}
              {req.completed_at && (
                <div className="flex items-center gap-2 text-slate-500">
                  <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Tests completed:</span>
                  <span className="text-slate-700 font-medium">{formatDate(req.completed_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Edit button — only for pending (incoming) requests */}
          {req.status === "incoming" && (
            <button
              type="button"
              onClick={() => onEditClick(req)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold text-sm transition"
            >
              <Pencil className="w-4 h-4" />
              Edit Request
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdFromUrl = searchParams.get("edit");

  const [doctorEmail, setDoctorEmail] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "incoming" | "seen" | "done">("all");
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingRequest, setEditingRequest] = useState<Request | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/doc-login/me");
      if (res.status === 401) { router.replace("/doc-login"); return; }
      const data = await res.json();
      if (!data.success) { setError(data.error ?? "Failed to load."); return; }
      setDoctorEmail(data.doctor_email);
      setRequests(data.requests);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Auto-open edit modal when ?edit=<id> is present in URL
  useEffect(() => {
    if (!editIdFromUrl || !requests.length) return;
    const target = requests.find((r) => r.id === editIdFromUrl);
    if (target && target.status === "incoming") {
      setEditingRequest(target);
      // Clean the URL param without triggering navigation
      const url = new URL(window.location.href);
      url.searchParams.delete("edit");
      window.history.replaceState({}, "", url.toString());
    }
  }, [editIdFromUrl, requests]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/doc-login/logout", { method: "POST" });
    router.replace("/doc-login");
  }

  function handleSaved(updated: Request) {
    setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    setEditingRequest(null);
  }

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const counts = {
    all: requests.length,
    incoming: requests.filter((r) => r.status === "incoming").length,
    seen: requests.filter((r) => r.status === "seen").length,
    done: requests.filter((r) => r.status === "done").length,
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Edit modal */}
      {editingRequest && (
        <EditModal
          req={editingRequest}
          onClose={() => setEditingRequest(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-white/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center shadow-sm shrink-0">
            <FlaskConical className="w-4 h-4 text-sky-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight">Doctor Portal</p>
            {doctorEmail && (
              <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                <Mail className="w-3 h-3 shrink-0" />{doctorEmail}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-500 shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition text-slate-500 shrink-0"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Summary chips */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "incoming", "seen", "done"] as const).map((s) => {
            const labels = { all: "All", incoming: "Pending", seen: "Arrived", done: "Completed" };
            const colors = {
              all: filter === "all" ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200",
              incoming: filter === "incoming" ? "bg-amber-500 text-white" : "bg-white text-amber-700 border border-amber-200",
              seen: filter === "seen" ? "bg-blue-500 text-white" : "bg-white text-blue-700 border border-blue-200",
              done: filter === "done" ? "bg-emerald-500 text-white" : "bg-white text-emerald-700 border border-emerald-200",
            };
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition shadow-sm ${colors[s]}`}
              >
                {labels[s]}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filter === s ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* Loading skeleton */}
        {loading && !requests.length && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                    <div className="h-4 bg-slate-100 rounded w-2/3" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <TestTube2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">
              {filter === "all" ? "No requests found" : `No ${filter} requests`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {filter === "all"
                ? "Requests you submit will appear here."
                : "Try switching to a different filter above."}
            </p>
          </div>
        )}

        {/* Request list */}
        {filtered.map((req) => (
          <RequestCard key={req.id} req={req} onEditClick={setEditingRequest} />
        ))}
      </main>

      {/* Footer */}
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <PoveonLogo className="w-4 h-4 opacity-40" />
        <span>© {new Date().getFullYear()} Poveon. All rights reserved.</span>
      </div>
    </div>
  );
}
