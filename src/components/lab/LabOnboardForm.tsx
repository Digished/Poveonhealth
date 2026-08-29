"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { User, FlaskConical, ShieldCheck, Check, Loader2, Copy, Search, Stethoscope, Lock, HelpCircle, MessageCircle, Plus, X, MapPin, ChevronDown, Camera, FileText, Trash2 } from "lucide-react";
import { TestTagInput, TestTag } from "@/components/ui/TestTagInput";
import { PhoneInput } from "@/components/PhoneInput";
import { STATE_NAMES, lgasForState } from "@/lib/nigeria-locations";
import { FuzzyCombo } from "@/components/ui/FuzzyCombo";

export interface OnboardLab {
  id?: string;
  slug?: string;
  name: string;
  logo_url?: string | null;
}

export interface OnboardTemplate {
  id: string;
  name: string;
  test_names: string[];
}

type Step = 0 | 1 | 2;

const STEP_META = [
  { label: "Your details", icon: User },
  { label: "Visit info", icon: FlaskConical },
  { label: "Consent", icon: ShieldCheck },
];

const REFERRAL_OPTIONS = [
  { value: "self", label: "Self referred" },
  { value: "doctor", label: "Referred by doctor / hospital" },
  { value: "hmo", label: "Referred by HMO" },
] as const;

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
  { value: "hmo", label: "HMO" },
  { value: "bill_hospital", label: "Bill to my hospital" },
] as const;

/** Auto-format a dd/mm/yyyy date as the user types (digits only, slashes inserted). */
function formatDobText(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Validate a dd/mm/yyyy string; returns its ISO date and the age in years. */
function parseDobText(v: string): { iso: string; age: number } | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]), mon = Number(m[2]), yr = Number(m[3]);
  const d = new Date(Date.UTC(yr, mon - 1, day));
  if (d.getUTCFullYear() !== yr || d.getUTCMonth() !== mon - 1 || d.getUTCDate() !== day) return null;
  if (d.getTime() > Date.now()) return null;
  const now = new Date();
  let age = now.getFullYear() - yr;
  const mDiff = now.getMonth() + 1 - mon;
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < day)) age--;
  if (age < 0 || age > 130) return null;
  return { iso: `${m[3]}-${m[2]}-${m[1]}`, age };
}

/** A PhoneInput value ("+234 8031234567") counts as valid with 7+ local digits. */
function phoneValid(p: string): boolean {
  const local = p.trim().split(/\s+/).slice(1).join("");
  return local.replace(/\D/g, "").length >= 7;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Split a stored full name ("First Other Surname") back into its parts. */
function splitName(full: string): { first: string; other: string; surname: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", other: "", surname: "" };
  if (parts.length === 1) return { first: parts[0], other: "", surname: "" };
  if (parts.length === 2) return { first: parts[0], other: "", surname: parts[1] };
  return { first: parts[0], other: parts.slice(1, -1).join(" "), surname: parts[parts.length - 1] };
}

/** ISO yyyy-mm-dd → dd/mm/yyyy for the DOB field. */
function isoToDdmmyyyy(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

/** Wraps a field group so it only appears (with a soft fade) once the prior
 *  group is filled — the progressive-reveal pattern used on the doctor side. */
function Reveal({ when, children }: { when: boolean; children: React.ReactNode }) {
  if (!when) return null;
  return <div className="animate-fade-in-up">{children}</div>;
}

/** One tidy label/value line on the review step. */
function ReviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400 pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 text-slate-700">{value}</dd>
    </div>
  );
}

/** A list of PhoneInputs with "add another number". */
function PhoneList({
  values,
  onChange,
  addLabel,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <PhoneInput value={v} onChange={(nv) => onChange(values.map((x, xi) => (xi === i ? nv : x)))} />
          </div>
          {i > 0 && (
            <button
              type="button"
              onClick={() => onChange(values.filter((_, xi) => xi !== i))}
              className="mt-2.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Remove number"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {values.length < 3 && (
        <button
          type="button"
          onClick={() => onChange([...values, ""])}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-medical-600 hover:text-medical-700"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Client onboarding form — one identical multi-step flow for the public QR
 * page (`/o/[labSlug]`, source="qr") and the queue's "Register walk-in"
 * (source="walk_in"). No prices are ever shown. "New registration" is the
 * default; "I have a Poveon code" sits to the right (and auto-opens when an
 * `initialCode` arrives via the emailed check-in link).
 */
export function LabOnboardForm({
  lab,
  source,
  templates = [],
  initialCode,
  onSuccess,
}: {
  lab: OnboardLab;
  source: "qr" | "walk_in";
  templates?: OnboardTemplate[];
  /** Pre-applied Poveon code (from the arrival email link) — auto-reveals. */
  initialCode?: string;
  onSuccess?: (code: string) => void;
}) {
  const isQr = source === "qr";
  const [step, setStep] = useState<Step>(0);
  const [surname, setSurname] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  // Multiple phone / WhatsApp numbers — first phone is the primary.
  const [phones, setPhones] = useState<string[]>([""]);
  const [phoneIsWhatsapp, setPhoneIsWhatsapp] = useState<"" | "yes" | "no">("");
  const [whatsapps, setWhatsapps] = useState<string[]>([""]);
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  // Where the client is coming from
  const [country, setCountry] = useState("Nigeria");
  const [stateOf, setStateOf] = useState("");
  const [lga, setLga] = useState("");
  const [referralType, setReferralType] = useState<"" | "self" | "doctor" | "hmo">("");
  const [doctorNameText, setDoctorNameText] = useState("");
  // Clients often can't read the name on the slip they were handed — let them
  // say so outright instead of guessing or leaving the field blank.
  const [doctorUnknown, setDoctorUnknown] = useState(false);
  const [referringOrg, setReferringOrg] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [paymentMode, setPaymentMode] = useState<"" | "cash" | "card" | "transfer" | "bill_hospital" | "hmo">("");
  const [complaintHelpOpen, setComplaintHelpOpen] = useState(false);
  const [tests, setTests] = useState<TestTag[]>([]);
  // "Use my referral form" — a photo/scan of the slip the client arrived with,
  // instead of (or alongside) typing the tests out.
  const [testsMode, setTestsMode] = useState<"list" | "form">("list");
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [formUploading, setFormUploading] = useState(false);
  const [formUploadError, setFormUploadError] = useState<string | null>(null);
  const [condition, setCondition] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; queueNumber?: number | null; statusPath?: string | null } | null>(null);

  // "New registration" leads; "I have a Poveon code" is the secondary path on
  // the right. An emailed check-in link pre-applies the code and auto-reveals.
  const [entryMode, setEntryMode] = useState<"manual" | "code">(initialCode ? "code" : "manual");
  const [lookupCode, setLookupCode] = useState(initialCode ?? "");
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revealed, setRevealed] = useState<{ code: string; tests: string; doctor_name: string | null; doctor_hospital: string | null } | null>(null);
  const autoRevealed = useRef(false);
  // A revealed Poveon code reuses the full manual form, pre-filled — the
  // referral (doctor + tests) stays locked.
  const codeMode = entryMode === "code" && !!revealed;

  // Hospital / HMO name lists for the referral pickers — the lab's partners
  // first, then the platform directory. Fields stay plain inputs until loaded.
  const [orgOptions, setOrgOptions] = useState<{ hospitals: string[]; hmos: string[] }>({ hospitals: [], hmos: [] });
  useEffect(() => {
    if (!lab.id && !lab.slug) return;
    const q = lab.id ? `lab_id=${encodeURIComponent(lab.id)}` : `lab_slug=${encodeURIComponent(lab.slug!)}`;
    fetch(`/api/onboard/partner-options?${q}`)
      .then((r) => r.json())
      .then((d) => { if (d?.success) setOrgOptions({ hospitals: d.hospitals ?? [], hmos: d.hmos ?? [] }); })
      .catch(() => {});
  }, [lab.id, lab.slug]);

  // Country is fixed to Nigeria for now (no editing).
  const fullName = [firstName.trim(), middleName.trim(), surname.trim()].filter(Boolean).join(" ");
  const dobParsed = parseDobText(dob);
  const primaryPhone = phones[0] ?? "";
  const validPhones = phones.map((p) => p.trim()).filter((p) => p && phoneValid(p));
  const validWhatsapps = whatsapps.map((p) => p.trim()).filter((p) => p && phoneValid(p));

  const detailsValid =
    (codeMode || !!referralType) &&
    surname.trim().length > 0 &&
    firstName.trim().length > 0 &&
    (codeMode || middleName.trim().length > 0) &&
    !!dobParsed &&
    sex.trim().length > 0 &&
    phoneValid(primaryPhone) &&
    phoneIsWhatsapp !== "" &&
    EMAIL_RE.test(email.trim()) &&
    stateOf.trim().length > 0 &&
    lga.trim().length > 0;

  // ── Progressive reveal — each field group appears once the prior one is
  // filled, so the form never looks like a wall of inputs. ──────────────────
  const rvSurname = codeMode || !!referralType;
  const rvNames = rvSurname && surname.trim().length > 0;
  const rvDobSex = rvNames && firstName.trim().length > 0;
  const rvPhone = rvDobSex && !!dobParsed && sex.trim().length > 0;
  const rvWhatsAppQ = rvPhone && phoneValid(primaryPhone);
  const rvEmail = rvWhatsAppQ && phoneIsWhatsapp !== "";
  const rvLocation = rvEmail && EMAIL_RE.test(email.trim());

  // The referring doctor's name is optional — many clients arrive with a slip
  // but no legible name, and the lab confirms the referrer at the desk.
  const referralValid =
    referralType === "hmo"
      ? referringOrg.trim().length > 0 && policyNumber.trim().length > 0
      : true;

  // Tests are optional — the lab confirms them at the desk.
  const visitValid = !!paymentMode && (codeMode || referralValid);

  // Overall progress (0–100) across the required fields of the whole form.
  const progressPct = (() => {
    const checks = [
      codeMode || !!referralType,
      surname.trim().length > 0,
      firstName.trim().length > 0,
      !!dobParsed,
      sex.trim().length > 0,
      phoneValid(primaryPhone),
      phoneIsWhatsapp !== "",
      EMAIL_RE.test(email.trim()),
      stateOf.trim().length > 0 && lga.trim().length > 0,
      codeMode || referralValid,
      !!paymentMode,
      consent,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  function addTemplate(t: OnboardTemplate) {
    const existing = new Set(tests.map((x) => x.name.toLowerCase()));
    const additions = t.test_names
      .filter((n) => !existing.has(n.toLowerCase()))
      .map((n) => ({ name: n, catalog_test_id: null }));
    setTests([...tests, ...additions]);
  }

  /** Upload a photo/scan of the client's referral form to Supabase Storage. */
  async function uploadReferralForm(file: File) {
    const MAX_MB = 10;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowed.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
      setFormUploadError("Please use a JPEG, PNG, WebP or HEIC image.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setFormUploadError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_MB} MB.`);
      return;
    }
    setFormUploading(true);
    setFormUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/requests/upload-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      setFormImageUrl(data.url);
    } catch (e) {
      setFormUploadError(e instanceof Error ? e.message : "Upload failed — please try again");
    } finally {
      setFormUploading(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      // If the main number is on WhatsApp, duplicate it as the WhatsApp number.
      const whatsappList = phoneIsWhatsapp === "yes" ? [primaryPhone.trim()] : validWhatsapps;
      const res = await fetch("/api/onboard/lab-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab_id: lab.id,
          lab_slug: lab.slug,
          source,
          patient_name: fullName,
          patient_phone: validPhones.join(", "),
          patient_email: email.trim(),
          patient_age: dobParsed?.age,
          dob: dobParsed?.iso,
          sex: sex || undefined,
          location_country: country.trim() || undefined,
          location_state: stateOf.trim() || undefined,
          location_lga: lga.trim() || undefined,
          tests: tests.length > 0 ? tests.map((t) => t.name).join(", ") : undefined,
          test_image_url: formImageUrl || undefined,
          condition: condition.trim() || undefined,
          referral_type: referralType || undefined,
          whatsapp_phone: whatsappList.join(", ") || undefined,
          referring_doctor_name: referralType !== "self" ? doctorNameText.trim() || undefined : undefined,
          referring_org: referringOrg.trim() || undefined,
          policy_number: referralType === "hmo" ? policyNumber.trim() || undefined : undefined,
          payment_mode: paymentMode || undefined,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Submission failed");
      onSuccess?.(data.code);
      // QR self-service continues to the personalised live queue-status page.
      if (isQr && data.status_path) {
        window.location.assign(data.status_path);
        return;
      }
      setDone({ code: data.code, queueNumber: data.queue_number, statusPath: data.status_path });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // Reveal an existing Poveon request by code so the client can confirm details.
  async function reveal(codeOverride?: string) {
    const c = (codeOverride ?? lookupCode).trim().toUpperCase();
    if (!c) { setError("Enter your Poveon code"); return; }
    setLooking(true); setError(null);
    try {
      const res = await fetch("/api/onboard/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lab_id: lab.id, lab_slug: lab.slug, code: c }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Request not found");
      const r = data.request;
      // Pre-fill every field of the standard form from the referral.
      const names = splitName(r.patient_name ?? "");
      setFirstName(names.first);
      setMiddleName(names.other);
      setSurname(names.surname);
      const phoneList = (r.patient_phone ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
      setPhones(phoneList.length > 0 ? phoneList : [""]);
      const waList = (r.whatsapp_phone ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
      if (waList.length > 0) {
        if (waList.length === 1 && phoneList[0] && waList[0] === phoneList[0]) {
          setPhoneIsWhatsapp("yes");
        } else {
          setPhoneIsWhatsapp("no");
          setWhatsapps(waList);
        }
      }
      setEmail(r.patient_email ?? "");
      setDob(isoToDdmmyyyy(r.dob ?? null));
      setSex((r.sex ?? "").toLowerCase());
      if (r.payment_mode) setPaymentMode(r.payment_mode);
      // Address is stored as "LGA, State, Country" — restore whatever matches.
      const addrParts = (r.address ?? "").split(",").map((x: string) => x.trim()).filter(Boolean);
      if (addrParts.length >= 3) {
        setCountry(addrParts[addrParts.length - 1]);
        const st = STATE_NAMES.find((n) => n.toLowerCase() === addrParts[1].toLowerCase());
        if (st) {
          setStateOf(st);
          const lg = lgasForState(st).find((n) => n.toLowerCase() === addrParts[0].toLowerCase());
          if (lg) setLga(lg);
        }
      }
      setStep(0);
      setRevealed({
        code: r.code,
        tests: r.tests ?? "",
        doctor_name: [r.doctor_prefix, r.doctor_name].filter(Boolean).join(" ") || null,
        doctor_hospital: r.doctor_hospital ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLooking(false);
    }
  }

  // Auto-reveal when the emailed check-in link pre-applies a code.
  useEffect(() => {
    if (initialCode && !autoRevealed.current) {
      autoRevealed.current = true;
      reveal(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  // Confirm the revealed details and submit (updates the existing request and
  // places the client in the queue).
  async function confirmDetails() {
    if (!revealed) return;
    setConfirming(true); setError(null);
    try {
      const whatsappList = phoneIsWhatsapp === "yes" ? [primaryPhone.trim()] : validWhatsapps;
      const res = await fetch("/api/onboard/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab_id: lab.id,
          lab_slug: lab.slug,
          code: revealed.code,
          patient_name: fullName,
          patient_phone: validPhones.join(", "),
          patient_email: email.trim() || undefined,
          patient_age: dobParsed?.age,
          dob: dobParsed?.iso,
          sex: sex || undefined,
          whatsapp_phone: whatsappList.join(", ") || undefined,
          payment_mode: paymentMode || undefined,
          location_country: country.trim() || undefined,
          location_state: stateOf.trim() || undefined,
          location_lga: lga.trim() || undefined,
          condition: condition.trim() || undefined,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not confirm");
      onSuccess?.(data.code);
      if (isQr && data.status_path) {
        window.location.assign(data.status_path);
        return;
      }
      setDone({ code: data.code, queueNumber: data.queue_number, statusPath: data.status_path });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm");
    } finally {
      setConfirming(false);
    }
  }

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">In the queue!</h3>
        <p className="mt-1 text-sm text-slate-500">
          {done.queueNumber != null ? `Queue number #${done.queueNumber} at ${lab.name}.` : `Registered at ${lab.name}.`}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-2xl font-bold tracking-wider text-medical-700">{done.code}</span>
          <button onClick={() => navigator.clipboard?.writeText(done.code)} className="text-slate-400 hover:text-slate-600" title="Copy code">
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Shared by the doctor and HMO referral branches — the name plus an explicit
  // "I don't know" escape hatch, which clears and locks the field.
  const doctorNameField = (
    <div>
      <label className={labelCls}>Referring doctor&apos;s name (optional)</label>
      <input
        className={`${inputCls} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`}
        value={doctorUnknown ? "" : doctorNameText}
        onChange={(e) => setDoctorNameText(e.target.value)}
        placeholder={doctorUnknown ? "The lab will confirm this at the desk" : "e.g. Dr. John Ade"}
        disabled={doctorUnknown}
      />
      <button
        type="button"
        onClick={() => {
          const next = !doctorUnknown;
          setDoctorUnknown(next);
          if (next) setDoctorNameText("");
        }}
        aria-pressed={doctorUnknown}
        className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
          doctorUnknown
            ? "border-medical-500 bg-medical-50 text-medical-800"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
        }`}
      >
        {doctorUnknown && <Check className="h-3 w-3" />} I don&apos;t know
      </button>
    </div>
  );

  return (
    <div>
      {/* Entry mode toggle — New registration first, Poveon code to the right */}
      <div className="mb-4 inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
        {([["manual", "New registration"], ["code", "I have a Poveon code"]] as const).map(([m, label]) => (
          <button key={m} type="button" onClick={() => { setEntryMode(m); setError(null); }} className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${entryMode === m ? "bg-medical-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>{label}</button>
        ))}
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Code path — find the Poveon request, then confirm details */}
      {entryMode === "code" && !revealed && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Enter the Poveon code from your referral to load and confirm your details.</p>
          <div className="flex gap-2">
            <input
              value={lookupCode}
              onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") reveal(); }}
              placeholder="e.g. 8X4K29Q"
              className={`${inputCls} font-mono uppercase tracking-wider`}
            />
            <button type="button" onClick={() => reveal()} disabled={looking || !lookupCode.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-medical-600 px-4 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find
            </button>
          </div>
        </div>
      )}

      {/* Manual path — identical for QR self-service and walk-in registration.
          A revealed Poveon code reuses the same full form, pre-filled. */}
      {(entryMode === "manual" || codeMode) && (<>
      {/* Locked referral summary (code path) */}
      {codeMode && revealed && (
        <div className="mb-4 rounded-xl border border-medical-200 bg-medical-50 p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-medical-700">
            <Stethoscope className="h-3.5 w-3.5" /> Your referral <Lock className="h-3 w-3" />
          </p>
          {revealed.doctor_name && (
            <p className="mt-1 font-medium text-slate-800">{revealed.doctor_name}{revealed.doctor_hospital ? ` · ${revealed.doctor_hospital}` : ""}</p>
          )}
          <p className="mt-1 text-xs text-slate-600">{revealed.tests || "Tests to be confirmed at the lab"}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">Your referring doctor and requested tests come from your referral and can&apos;t be changed here.</p>
        </div>
      )}
      {/* Progress bar — shows how far along the whole form the client is, and
          which short step they're on. Keeps the flow from feeling long. */}
      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">{STEP_META[step].label}</p>
          <p className="text-xs font-medium text-slate-400">Step {step + 1} of {STEP_META.length} · {progressPct}%</p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-medical-500 transition-all duration-300" style={{ width: `${Math.max(progressPct, 4)}%` }} />
        </div>
      </div>

      {step === 0 && (
        <div className="space-y-3">
          {!codeMode && (
          <div>
            <label className={labelCls}>How were you referred? *</label>
            <div className="grid grid-cols-1 gap-1.5">
              {REFERRAL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    // The hospital and HMO fields share referringOrg — drop it
                    // so a hospital picked earlier can't pre-fill the HMO field.
                    if (o.value !== referralType) setReferringOrg("");
                    setReferralType(o.value);
                  }}
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition ${referralType === o.value ? "border-medical-500 bg-medical-50 text-medical-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${referralType === o.value ? "border-medical-600 bg-medical-600" : "border-slate-300"}`}>
                    {referralType === o.value && <Check className="h-3 w-3 text-white" />}
                  </span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          )}
          <Reveal when={rvSurname}>
            <label className={labelCls}>Surname *</label>
            <input className={inputCls} value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="e.g. Okafor" autoComplete="family-name" autoFocus={!codeMode} />
          </Reveal>
          <Reveal when={rvNames}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>First name *</label>
                <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Ada" autoComplete="given-name" />
              </div>
              <div>
                <label className={labelCls}>Other name {codeMode ? "" : "*"}</label>
                <input className={inputCls} value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="e.g. Chidi" autoComplete="additional-name" />
              </div>
            </div>
          </Reveal>
          <Reveal when={rvDobSex}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date of birth *</label>
                <input
                  className={inputCls}
                  value={dob}
                  onChange={(e) => setDob(formatDobText(e.target.value))}
                  placeholder="dd/mm/yyyy"
                  inputMode="numeric"
                  autoComplete="bday"
                />
                {dob.length === 10 && (
                  dobParsed ? (
                    <p className="mt-1 text-[11px] font-medium text-emerald-600">Age: {dobParsed.age} year{dobParsed.age === 1 ? "" : "s"}</p>
                  ) : (
                    <p className="mt-1 text-[11px] font-medium text-red-600">Enter a valid date (dd/mm/yyyy)</p>
                  )
                )}
              </div>
              <div>
                <label className={labelCls}>Sex *</label>
                <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value)}>
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </Reveal>
          <Reveal when={rvPhone}>
            <label className={labelCls}>Phone number *</label>
            <PhoneList values={phones} onChange={setPhones} addLabel="Add another phone number" />
          </Reveal>
          <Reveal when={rvWhatsAppQ}>
            <label className={labelCls}>
              Is <span className="font-semibold text-slate-800">{primaryPhone.trim() || "your phone number"}</span> on WhatsApp? *
            </label>
            <div className="flex gap-2">
              {([["yes", "Yes, it's on WhatsApp"], ["no", "No"]] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPhoneIsWhatsapp(v)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${phoneIsWhatsapp === v ? "border-medical-500 bg-medical-50 text-medical-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  <MessageCircle className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            {phoneIsWhatsapp === "no" && (
              <div className="mt-3">
                <label className={labelCls}>WhatsApp number (optional)</label>
                <PhoneList values={whatsapps} onChange={setWhatsapps} addLabel="Add another WhatsApp number" />
              </div>
            )}
          </Reveal>
          <Reveal when={rvEmail}>
            <label className={labelCls}>Email *</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" inputMode="email" autoComplete="email" />
            {email.trim().length > 0 && !EMAIL_RE.test(email.trim()) && (
              <p className="mt-1 text-[11px] font-medium text-red-600">Enter a valid email address</p>
            )}
          </Reveal>
          <Reveal when={rvLocation}>
            <label className={`${labelCls} flex items-center gap-1.5`}><MapPin className="h-3.5 w-3.5 text-slate-400" /> Address *</label>
            <div className="grid grid-cols-2 gap-3">
              <FuzzyCombo
                value={stateOf}
                onChange={(v) => { setStateOf(v); setLga(""); }}
                options={STATE_NAMES}
                placeholder="State *"
              />
              <FuzzyCombo
                value={lga}
                onChange={setLga}
                options={lgasForState(stateOf)}
                placeholder={stateOf ? "Local government *" : "Pick a state first"}
                disabled={!stateOf}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Nigeria</p>
          </Reveal>
          <button
            onClick={() => setStep(1)}
            disabled={!detailsValid}
            className="mt-2 w-full rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {!codeMode && referralType === "doctor" && (
            <>
              {doctorNameField}
              <div>
                <label className={labelCls}>Referring hospital / company (optional)</label>
                {orgOptions.hospitals.length > 0 ? (
                  <FuzzyCombo
                    value={referringOrg}
                    onChange={setReferringOrg}
                    options={orgOptions.hospitals}
                    placeholder="Search hospital / company"
                    allowCustom
                  />
                ) : (
                  <input className={inputCls} value={referringOrg} onChange={(e) => setReferringOrg(e.target.value)} placeholder="e.g. St. Mary's Hospital" />
                )}
              </div>
            </>
          )}
          {!codeMode && referralType === "hmo" && (
            <>
              <div>
                <label className={labelCls}>Name of HMO *</label>
                {orgOptions.hmos.length > 0 ? (
                  <FuzzyCombo
                    value={referringOrg}
                    onChange={setReferringOrg}
                    options={orgOptions.hmos}
                    placeholder="Search your HMO *"
                    allowCustom
                  />
                ) : (
                  <input className={inputCls} value={referringOrg} onChange={(e) => setReferringOrg(e.target.value)} placeholder="e.g. Hygeia HMO" />
                )}
              </div>
              <div>
                <label className={labelCls}>Policy number *</label>
                <input className={inputCls} value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} placeholder="Your HMO policy / enrollee number" />
              </div>
              {doctorNameField}
            </>
          )}
          {!codeMode && templates.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">Quick panels</p>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button key={t.id} onClick={() => addTemplate(t)} className="rounded-full border border-medical-200 bg-medical-50 px-3 py-1 text-xs font-medium text-medical-700 hover:bg-medical-100">
                    + {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {codeMode && revealed ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">Tests requested <Lock className="h-3 w-3" /></p>
              <p className="mt-0.5 text-slate-700">{revealed.tests || "To be confirmed at the lab"}</p>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Tests / investigations (optional)</label>
              {/* Two ways to tell the lab what you need: pick the tests, or just
                  photograph the referral form you arrived with. */}
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTestsMode("list")}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${testsMode === "list" ? "border-medical-500 bg-medical-50 text-medical-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  Choose my tests
                </button>
                <button
                  type="button"
                  onClick={() => setTestsMode("form")}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${testsMode === "form" ? "border-medical-500 bg-medical-50 text-medical-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  <FileText className="h-3.5 w-3.5" /> Use my referral form
                </button>
              </div>

              {testsMode === "list" ? (
                <>
                  <TestTagInput value={tests} onChange={setTests} labId={lab.id} />
                  <p className="mt-1 text-[11px] text-slate-400">Not sure? Leave it blank — the team will confirm your tests at the desk.</p>
                </>
              ) : formImageUrl ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={formImageUrl} alt="Your referral form" className="max-h-56 w-full rounded-lg object-contain" />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> Referral form attached
                    </p>
                    <button
                      type="button"
                      onClick={() => { setFormImageUrl(null); setFormUploadError(null); }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <label className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${formUploading ? "border-slate-200 bg-slate-50" : "border-medical-200 bg-medical-50/50 hover:border-medical-400 hover:bg-medical-50"}`}>
                    {formUploading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin text-medical-600" />
                        <span className="text-xs font-medium text-slate-500">Uploading…</span>
                      </>
                    ) : (
                      <>
                        <Camera className="h-5 w-5 text-medical-600" />
                        <span className="text-xs font-semibold text-medical-700">Take a photo or upload your form</span>
                        <span className="text-[11px] text-slate-400">JPEG, PNG, WebP or HEIC · up to 10 MB</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,.heic"
                      capture="environment"
                      className="sr-only"
                      disabled={formUploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) uploadReferralForm(file);
                      }}
                    />
                  </label>
                  <p className="mt-1 text-[11px] text-slate-400">The lab will read your tests off the form at the desk.</p>
                </>
              )}
              {formUploadError && <p className="mt-1 text-[11px] font-medium text-red-600">{formUploadError}</p>}
            </div>
          )}
          <div>
            <label className={`${labelCls} flex items-center gap-1.5`}>
              Complaint (optional)
              <button
                type="button"
                onClick={() => setComplaintHelpOpen((v) => !v)}
                className="text-slate-400 hover:text-medical-600"
                title="What is this?"
                aria-label="What is a complaint?"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </label>
            {complaintHelpOpen && (
              <p className="mb-1.5 rounded-lg bg-medical-50 px-3 py-2 text-[11px] leading-relaxed text-medical-800">
                Briefly describe what&apos;s bothering you or why you&apos;re doing these tests — e.g. &ldquo;fever and headache for 3 days&rdquo; or &ldquo;routine annual check-up&rdquo;. This helps our team serve you better.
              </p>
            )}
            <textarea className={inputCls} rows={3} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. Fever and headache for 3 days" />
          </div>
          <Reveal when={codeMode || referralValid}>
            <label className={labelCls}>How will you pay? *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {PAYMENT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setPaymentMode(o.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${paymentMode === o.value ? "border-medical-500 bg-medical-50 text-medical-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </Reveal>
          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
            <button onClick={() => setStep(2)} disabled={!visitValid} className="flex-1 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">Continue</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{fullName}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {[dob ? `${dob}${dobParsed ? ` · ${dobParsed.age} yrs` : ""}` : null, sex ? sex.charAt(0).toUpperCase() + sex.slice(1) : null].filter(Boolean).join("  ·  ")}
              </p>
            </div>
            <dl className="divide-y divide-slate-100 text-sm">
              <ReviewRow label="Phone" value={validPhones.join(", ")} />
              <ReviewRow label="WhatsApp" value={phoneIsWhatsapp === "yes" ? `${primaryPhone.trim()} (same number)` : validWhatsapps.join(", ") || "—"} />
              <ReviewRow label="Email" value={email.trim()} />
              <ReviewRow label="Address" value={[lga, stateOf, country].filter(Boolean).join(", ")} />
              {codeMode ? (
                <ReviewRow label="Referral" value={[revealed?.doctor_name, revealed?.doctor_hospital].filter(Boolean).join(" · ") || "Poveon referral"} />
              ) : (
                <>
                  <ReviewRow label="Referral" value={REFERRAL_OPTIONS.find((o) => o.value === referralType)?.label ?? ""} />
                  {referralType !== "self" && (doctorUnknown || doctorNameText.trim() || referringOrg.trim()) && (
                    <ReviewRow
                      label={referralType === "hmo" ? "HMO" : "Doctor"}
                      value={[doctorUnknown ? "Doctor not known" : doctorNameText.trim(), referringOrg.trim()].filter(Boolean).join(" · ")}
                    />
                  )}
                  {referralType === "hmo" && policyNumber.trim() && <ReviewRow label="Policy no." value={policyNumber.trim()} />}
                </>
              )}
              <ReviewRow label="Tests" value={codeMode ? (revealed?.tests || "To be confirmed at the lab") : tests.length > 0 ? tests.map((t) => t.name).join(", ") : formImageUrl ? "See attached referral form" : "To be confirmed at the lab"} />
              {condition.trim() && <ReviewRow label="Complaint" value={condition.trim()} />}
              <ReviewRow label="Payment" value={PAYMENT_OPTIONS.find((o) => o.value === paymentMode)?.label ?? ""} />
            </dl>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-medical-600" />
            <span>I consent to {lab.name} collecting and processing my samples and personal data for the requested tests.</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
            <button onClick={codeMode ? confirmDetails : submit} disabled={!consent || submitting || confirming} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {(submitting || confirming) && <Loader2 className="h-4 w-4 animate-spin" />}
              {codeMode ? "Confirm & join the queue" : source === "walk_in" ? "Register & join queue" : "Join the queue"}
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
