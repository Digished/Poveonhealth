"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  BadgeCheck, Check, Clock, FileText, Loader2, Save, ShieldAlert, ShieldCheck, Upload,
} from "lucide-react";
import { DateInput } from "@/components/ui/DateInput";

type Credential = {
  mdcn_number: string | null;
  license_expires_at: string | null;
  license_doc_url: string | null;
  id_doc_url: string | null;
  cv_url: string | null;
  qualifications: string | null;
  specialty: string | null;
  years_experience: number | null;
  note: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

const SLOTS = [
  { key: "license", label: "Annual practising licence", required: true, field: "license_doc_url" },
  { key: "id", label: "Government ID", required: false, field: "id_doc_url" },
  { key: "cv", label: "CV", required: false, field: "cv_url" },
] as const;

/**
 * Where a doctor files what an admin needs to clear them for the care plan.
 *
 * Nothing here approves anyone — approval is a person's decision, made in the
 * admin dashboard. This panel just makes the application legible and says
 * plainly where it stands.
 */
export function DoctorCredentialsPanel({ onApproved }: { onApproved?: (approved: boolean) => void }) {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    mdcn_number: "",
    license_expires_at: "",
    qualifications: "",
    specialty: "",
    years_experience: "",
    note: "",
  });

  // Through a ref: the parent passes an inline arrow, so depending on it
  // directly rebuilt `load` on every render and the effect re-fetched forever.
  const onApprovedRef = useRef(onApproved);
  onApprovedRef.current = onApproved;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/doc-login/credentials", { cache: "no-store" });
      const d = await res.json();
      if (!d.success) return;
      setCredential(d.credential);
      setApproved(d.approved);
      onApprovedRef.current?.(d.approved);
      setForm({
        mdcn_number: d.credential.mdcn_number ?? "",
        license_expires_at: d.credential.license_expires_at
          ? String(d.credential.license_expires_at).slice(0, 10)
          : "",
        qualifications: d.credential.qualifications ?? "",
        specialty: d.credential.specialty ?? "",
        years_experience: d.credential.years_experience != null ? String(d.credential.years_experience) : "",
        note: d.credential.note ?? "",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(submit: boolean) {
    if (saving) return;
    setSaving(submit ? "submit" : "draft");
    setError("");
    try {
      const res = await fetch("/api/doc-login/credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          years_experience: form.years_experience ? Number(form.years_experience) : null,
          specialty: form.specialty || null,
          note: form.note || null,
          submit,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.error ?? "Could not save."); return; }
      toast.success(submit ? "Filed for review" : "Saved");
      load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-slate-100 bg-white" />;
  }

  const status = approved ? "approved" : credential?.status ?? "unsubmitted";
  const hasLicence = !!credential?.license_doc_url;
  // Under review: frozen, so what the reviewer is looking at can't change.
  const underReview = status === "pending";
  // Approved: identity is settled. The licence still expires every year, so
  // that one field — and the documents — stay open.
  const settled = status === "approved";
  const fieldsLocked = underReview || settled;
  const canSubmit =
    form.mdcn_number.trim().length >= 3 &&
    !!form.license_expires_at &&
    form.qualifications.trim().length >= 2 &&
    hasLicence;

  return (
    <div className="space-y-4 xl:max-w-3xl">
      <StatusBanner status={status} note={credential?.review_note ?? null} />

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Your practising credentials</h3>
        <p className="mt-1 text-sm text-slate-500">
          Care-plan members are people managing a long-term condition, so an admin checks every
          doctor by hand before anyone is assigned to them.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="MDCN registration number" required>
            {fieldsLocked ? (
              <ReadOnly value={form.mdcn_number} />
            ) : (
              <input
                value={form.mdcn_number}
                onChange={(e) => setForm({ ...form, mdcn_number: e.target.value })}
                placeholder="e.g. MDCN/R/12345"
                className={inputClass}
              />
            )}
          </Field>

          {/* Always editable once approved — a practising licence is annual. */}
          <Field label="Practising licence expires" required>
            {underReview ? (
              <ReadOnly value={form.license_expires_at ? formatDate(form.license_expires_at) : ""} />
            ) : (
              <DateInput
                value={form.license_expires_at}
                onChange={(iso) => setForm({ ...form, license_expires_at: iso })}
                futureOnly
              />
            )}
            <p className="mt-1 text-xs text-slate-400">
              {settled
                ? "Renewed your licence? Update the expiry and upload the new one below."
                : "The expiry on your current annual licence, as dd/mm/yyyy."}
            </p>
          </Field>

          <Field label="Qualifications" required>
            {fieldsLocked ? (
              <ReadOnly value={form.qualifications} />
            ) : (
              <input
                value={form.qualifications}
                onChange={(e) => setForm({ ...form, qualifications: e.target.value })}
                placeholder="e.g. MBBS (Ibadan), FWACP"
                className={inputClass}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Specialty">
              {fieldsLocked ? (
                <ReadOnly value={form.specialty} />
              ) : (
                <input
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  placeholder="e.g. Family Medicine"
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Years in practice">
              {fieldsLocked ? (
                <ReadOnly value={form.years_experience} />
              ) : (
                <input
                  inputMode="numeric"
                  value={form.years_experience}
                  onChange={(e) => setForm({ ...form, years_experience: e.target.value.replace(/\D/g, "") })}
                  placeholder="e.g. 8"
                  className={inputClass}
                />
              )}
            </Field>
          </div>

          {!fieldsLocked && (
            <Field label="Anything the reviewer should know">
              <textarea
                rows={3}
                maxLength={1000}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Optional — experience with hypertension or diabetes care, clinics you run…"
                className={`${inputClass} resize-none`}
              />
            </Field>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Documents</h3>
        <p className="mt-1 text-sm text-slate-500">
          {underReview
            ? "Locked while your application is being reviewed."
            : "Stored privately and only opened by the reviewing admin. JPEG, PNG, WebP or PDF, up to 15MB."}
        </p>
        <div className="mt-4 space-y-2.5">
          {SLOTS.map((slot) => (
            <DocumentRow
              key={slot.key}
              slot={slot.key}
              label={slot.label}
              required={slot.required}
              uploaded={!!credential?.[slot.field]}
              locked={underReview}
              onUploaded={load}
            />
          ))}
        </div>
        {settled && (
          <p className="mt-3 text-xs text-slate-500">
            Upload a renewed licence here each year. Anything you skipped earlier can still be added.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {settled && (
        <button
          onClick={() => save(false)}
          disabled={!!saving || !form.license_expires_at}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-medical-700 disabled:opacity-40"
        >
          {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save licence renewal
        </button>
      )}

      {!settled && !underReview && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => save(false)}
              disabled={!!saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
            >
              {saving === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save draft
            </button>
            <button
              onClick={() => save(true)}
              disabled={!!saving || !canSubmit}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-medical-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-medical-600/25 transition hover:bg-medical-700 disabled:opacity-40"
            >
              {saving === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {credential?.status === "rejected" ? "Re-submit for review" : "Submit for review"}
            </button>
          </div>
          {!canSubmit && (
            <p className="text-xs text-slate-400">
              {hasLicence
                ? "Fill in your MDCN number, licence expiry and qualifications to submit."
                : "Attach your current practising licence to submit."}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

/** A settled value — shown instead of an input once it can no longer change. */
function ReadOnly({ value }: { value: string }) {
  return (
    <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
      {value || <span className="text-slate-400">—</span>}
    </p>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
    </div>
  );
}

function StatusBanner({ status, note }: { status: string; note: string | null }) {
  if (status === "approved") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-bold text-emerald-900">You&apos;re cleared for the care plan</p>
          <p className="mt-0.5 text-sm text-emerald-800/90">
            Members are being assigned to you. Set how many you&apos;ll take a year under Intake.
          </p>
        </div>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-bold text-amber-900">With the review team</p>
          <p className="mt-0.5 text-sm text-amber-800/90">
            We&apos;ll email you once a decision is made. You can still update anything below.
          </p>
        </div>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div>
          <p className="text-sm font-bold text-red-900">Not approved yet</p>
          {note && <p className="mt-0.5 whitespace-pre-wrap text-sm text-red-800/90">{note}</p>}
          <p className="mt-1 text-sm text-red-800/90">Update your application and submit it again.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
      <div>
        <p className="text-sm font-bold text-slate-800">Not yet applied</p>
        <p className="mt-0.5 text-sm text-slate-600">
          File your credentials to start taking care-plan members. Everything else in the portal works
          without this.
        </p>
      </div>
    </div>
  );
}

function DocumentRow({
  slot, label, required, uploaded, locked, onUploaded,
}: {
  slot: string; label: string; required: boolean; uploaded: boolean; locked: boolean;
  onUploaded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("slot", slot);
      fd.append("file", file);
      const res = await fetch("/api/doc-login/credentials/document", { method: "POST", body: fd });
      // A rejected upload can come back as HTML (a platform size limit, say),
      // so don't assume JSON — that used to surface as a silent failure.
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        toast.error(d?.error ?? `Upload failed (${res.status}). Try a smaller file.`);
        return;
      }
      toast.success(`${label} uploaded`);
      onUploaded();
    } catch {
      toast.error("Network error while uploading.");
    } finally {
      setBusy(false);
      // Let the same file be re-picked after a failure.
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          uploaded ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
        }`}
      >
        {uploaded ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </p>
        <p className="text-xs text-slate-400">{uploaded ? "On file" : "Not uploaded"}</p>
      </div>
      {!locked && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-medical-300 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploaded ? "Replace" : "Upload"}
        </button>
      )}
    </div>
  );
}
