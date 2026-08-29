"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Check, Droplet, HeartPulse, Loader2, MapPin,
  ShieldCheck, User, X,
} from "lucide-react";
import { STATE_NAMES, lgasForState } from "@/lib/nigeria-locations";
import { FuzzyCombo } from "@/components/ui/FuzzyCombo";
import { PhoneInput } from "@/components/PhoneInput";
import { DobInput } from "@/components/DobInput";
import { ProviderPicker, ProviderRow, type Provider } from "@/components/consults/ProviderPicker";
import {
  ADHERENCE_OPTIONS,
  DURATION_OPTIONS,
  GLUCOSE_CONTEXTS,
  LAST_VISIT_OPTIONS,
  type Adherence,
} from "@/components/consults/baseline";
import { useViewport } from "@/components/ui/Overlay";

export type CarePlanBenefits = {
  price_naira: number;
  message_allowance: number;
  lab_discount_percent: number;
  pharmacy_discount_percent: number;
};

export type CarePlanPrefill = {
  full_name?: string;
  phone?: string;
  date_of_birth?: string;
  sex?: string;
};

type Form = {
  full_name: string;
  phone: string;
  sex: "male" | "female" | "";
  date_of_birth: string;
  state: string;
  city: string;
  conditions: string[];
  consent: boolean;
};

const STEPS = ["Your details", "Your health", "Your baseline", "Confirm"] as const;

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/** Whole years from an ISO date, or "" when it isn't derivable. */
function ageFromIso(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : "";
}

/**
 * The care-plan enrolment popup.
 *
 * Opens over the patient dashboard already filled in with whatever we hold for
 * them — a portal profile, or their most recent lab request — so an existing
 * patient only confirms and pays.
 */
export function CarePlanEnrollModal({
  benefits,
  prefill,
  partnerCode = null,
  onClose,
}: {
  benefits: CarePlanBenefits;
  prefill: CarePlanPrefill;
  /** A pharmacy or lab whose QR poster brought them here. */
  partnerCode?: { kind: "pharmacy" | "lab"; code: string } | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>({
    full_name: prefill.full_name ?? "",
    phone: prefill.phone ?? "",
    sex: prefill.sex === "male" || prefill.sex === "female" ? prefill.sex : "",
    date_of_birth: prefill.date_of_birth ?? "",
    state: "",
    city: "",
    conditions: [],
    consent: false,
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pharmacy, setPharmacy] = useState<Provider | null>(null);
  const [lab, setLab] = useState<Provider | null>(null);
  const [picking, setPicking] = useState<"pharmacy" | "lab" | null>(null);
  // Baseline — everything but adherence is optional, and a blank answer is
  // better than a guessed one.
  const vp = useViewport(true);

  // Scanned a partner's QR poster: resolve their code and start with that
  // pharmacy or lab already chosen, so nobody has to find it in a list.
  useEffect(() => {
    if (!partnerCode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/consults/partner?kind=${partnerCode.kind}&code=${encodeURIComponent(partnerCode.code)}`,
          { cache: "no-store" }
        );
        const d = await res.json();
        if (cancelled || !d?.success || !d.provider) return;
        if (partnerCode.kind === "pharmacy") setPharmacy(d.provider);
        else setLab(d.provider);
      } catch {
        /* they can still pick one by hand */
      }
    })();
    return () => { cancelled = true; };
  }, [partnerCode]);

  const [baseline, setBaseline] = useState({
    medication_adherence: "" as Adherence | "",
    baseline_medications: "",
    hypertension_years: "",
    diabetes_years: "",
    baseline_bp_systolic: "",
    baseline_bp_diastolic: "",
    baseline_glucose_mg_dl: "",
    baseline_glucose_context: "",
    baseline_notes: "",
    baseline_last_visit: "",
    baseline_self_care: "",
  });

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleCondition = (c: string) =>
    setForm((f) => ({
      ...f,
      conditions: f.conditions.includes(c) ? f.conditions.filter((x) => x !== c) : [...f.conditions, c],
    }));

  const age = ageFromIso(form.date_of_birth);

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return form.full_name.trim().length >= 2 && form.phone.replace(/\D/g, "").length >= 10;
      case 1:
        return form.conditions.length > 0;
      case 2:
        return !!baseline.medication_adherence;
      default:
        return form.consent;
    }
  }, [step, form, baseline]);

  function next() {
    setError("");
    if (stepValid) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function submit() {
    if (submitting || !form.consent) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/consults/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          phone: form.phone,
          sex: form.sex || null,
          date_of_birth: form.date_of_birth || null,
          state: form.state || null,
          city: form.city || null,
          conditions: form.conditions,
          preferred_pharmacy_id: pharmacy?.id ?? null,
          preferred_lab_id: lab?.id ?? null,

          medication_adherence: baseline.medication_adherence,
          baseline_medications: baseline.baseline_medications || null,
          hypertension_years: baseline.hypertension_years ? Number(baseline.hypertension_years) : null,
          diabetes_years: baseline.diabetes_years ? Number(baseline.diabetes_years) : null,
          baseline_bp_systolic: baseline.baseline_bp_systolic ? Number(baseline.baseline_bp_systolic) : null,
          baseline_bp_diastolic: baseline.baseline_bp_diastolic ? Number(baseline.baseline_bp_diastolic) : null,
          baseline_glucose_mg_dl: baseline.baseline_glucose_mg_dl ? Number(baseline.baseline_glucose_mg_dl) : null,
          baseline_glucose_context: baseline.baseline_glucose_context || null,
          baseline_notes: baseline.baseline_notes || null,
          baseline_last_visit: baseline.baseline_last_visit || null,
          baseline_self_care: baseline.baseline_self_care || null,

          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      window.location.href = data.authorization_url;
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="animate-fade-in fixed z-[300] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      // Anchored to the visual viewport, not the layout one: when the mobile
      // keyboard opens the two stop agreeing, and a dialog sized to the layout
      // viewport puts its own inputs behind the keys.
      style={vp.height ? { top: vp.top, left: vp.left, width: vp.width, height: vp.height } : { inset: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Join the Poveon Care Plan"
    >
      <div className="animate-slide-up flex w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
        style={{ maxHeight: vp.height ? vp.height - 8 : "92dvh" }}>
        {/* Header */}
        <div className="relative shrink-0 bg-gradient-to-br from-medical-600 to-medical-800 px-5 pb-5 pt-5 text-white sm:px-6">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Join the Care Plan</h2>
              <p className="text-xs text-white/70">
                {naira(benefits.price_naira)} a year · {benefits.message_allowance} doctor messages
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1">
                <div
                  className={`h-1.5 rounded-full transition-colors duration-300 ${
                    i < step ? "bg-emerald-300" : i === step ? "bg-white" : "bg-white/25"
                  }`}
                />
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-white/70">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          {step === 0 && (
            <Section
              icon={<User className="h-5 w-5" />}
              title="Confirm your details"
              blurb="We've filled in what we already have. Correct anything that's changed."
            >
              <Field label="Full name">
                <input
                  autoFocus
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="e.g. Amaka Obi"
                  className={inputClass}
                />
              </Field>
              <Field label="Phone number">
                <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
              </Field>
              <Field label="Date of birth" optional>
                <DobInput value={form.date_of_birth} onChange={(iso) => set("date_of_birth", iso)} noLabel />
              </Field>
              <Field label="Sex" optional>
                <div className="flex gap-2">
                  {(["female", "male"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => set("sex", form.sex === s ? "" : s)}
                      className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition ${
                        form.sex === s
                          ? "border-medical-500 bg-medical-50 text-medical-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>
          )}

          {step === 1 && (
            <Section
              icon={<HeartPulse className="h-5 w-5" />}
              title="What are you managing?"
              blurb="Pick everything that applies — it's the first thing your doctor sees."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ConditionCard
                  active={form.conditions.includes("hypertension")}
                  onClick={() => toggleCondition("hypertension")}
                  icon={<HeartPulse className="h-5 w-5" />}
                  title="Hypertension"
                  blurb="High blood pressure"
                />
                <ConditionCard
                  active={form.conditions.includes("diabetes")}
                  onClick={() => toggleCondition("diabetes")}
                  icon={<Droplet className="h-5 w-5" />}
                  title="Diabetes"
                  blurb="Type 1 or type 2"
                />
              </div>

              <Field label="Where are you?" optional>
                <div className="grid grid-cols-2 gap-3">
                  <FuzzyCombo
                    value={form.state}
                    onChange={(v) => { set("state", v); set("city", ""); }}
                    options={STATE_NAMES}
                    placeholder="State"
                  />
                  <FuzzyCombo
                    value={form.city}
                    onChange={(v) => set("city", v)}
                    options={lgasForState(form.state)}
                    placeholder={form.state ? "Local government" : "Pick a state first"}
                    disabled={!form.state}
                    allowCustom
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Helps us point you at partner labs and pharmacies near you.
                </p>
              </Field>

              <Field label="Preferred pharmacy" optional>
                <ProviderRow
                  kind="pharmacy"
                  provider={pharmacy}
                  onOpen={() => setPicking("pharmacy")}
                  onClear={() => setPharmacy(null)}
                />
              </Field>

              <Field label="Preferred laboratory" optional>
                <ProviderRow
                  kind="lab"
                  provider={lab}
                  onOpen={() => setPicking("lab")}
                  onClear={() => setLab(null)}
                />
              </Field>
            </Section>
          )}

          {step === 2 && (
            <Section
              icon={<Activity className="h-5 w-5" />}
              title="Where you are today"
              blurb="Your doctor reads this first. Answer what you know — skip anything you don't."
            >
              <Field label="How often do you take your medication?">
                <div className="space-y-2">
                  {ADHERENCE_OPTIONS.map((o) => {
                    const on = baseline.medication_adherence === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setBaseline((b) => ({ ...b, medication_adherence: o.value }))}
                        aria-pressed={on}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                          on
                            ? "border-medical-500 bg-medical-50"
                            : "border-slate-200 bg-white hover:border-medical-200"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            on ? "border-medical-600" : "border-slate-300"
                          }`}
                        >
                          {on && <span className="h-2 w-2 rounded-full bg-medical-600" />}
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${on ? "text-medical-900" : "text-slate-700"}`}>
                            {o.label}
                          </span>
                          <span className="block text-xs text-slate-500">{o.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              {baseline.medication_adherence !== "none" && (
                <Field label="What medication are you on?" optional>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={baseline.baseline_medications}
                    onChange={(e) => setBaseline((b) => ({ ...b, baseline_medications: e.target.value }))}
                    placeholder="e.g. Amlodipine 5mg once daily, Metformin 500mg twice daily"
                    className={`${inputClass} resize-none`}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Names and doses if you know them — otherwise just describe them.
                  </p>
                </Field>
              )}

              {form.conditions.includes("hypertension") && (
                <Field label="How long have you had high blood pressure?" optional>
                  <DurationChips
                    value={baseline.hypertension_years}
                    onChange={(v) => setBaseline((b) => ({ ...b, hypertension_years: v }))}
                  />
                </Field>
              )}

              {form.conditions.includes("diabetes") && (
                <Field label="How long have you had diabetes?" optional>
                  <DurationChips
                    value={baseline.diabetes_years}
                    onChange={(v) => setBaseline((b) => ({ ...b, diabetes_years: v }))}
                  />
                </Field>
              )}

              {form.conditions.includes("hypertension") && (
                <Field label="Your last blood-pressure reading" optional>
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="numeric"
                      maxLength={3}
                      value={baseline.baseline_bp_systolic}
                      onChange={(e) =>
                        setBaseline((b) => ({ ...b, baseline_bp_systolic: e.target.value.replace(/\D/g, "") }))
                      }
                      placeholder="120"
                      className={`${inputClass} text-center`}
                    />
                    <span className="text-lg font-bold text-slate-300">/</span>
                    <input
                      inputMode="numeric"
                      maxLength={3}
                      value={baseline.baseline_bp_diastolic}
                      onChange={(e) =>
                        setBaseline((b) => ({ ...b, baseline_bp_diastolic: e.target.value.replace(/\D/g, "") }))
                      }
                      placeholder="80"
                      className={`${inputClass} text-center`}
                    />
                    <span className="shrink-0 text-xs text-slate-400">mmHg</span>
                  </div>
                </Field>
              )}

              {form.conditions.includes("diabetes") && (
                <Field label="Your last blood-sugar reading" optional>
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="decimal"
                      value={baseline.baseline_glucose_mg_dl}
                      onChange={(e) =>
                        setBaseline((b) => ({ ...b, baseline_glucose_mg_dl: e.target.value.replace(/[^\d.]/g, "") }))
                      }
                      placeholder="110"
                      className={`${inputClass} text-center`}
                    />
                    <span className="shrink-0 text-xs text-slate-400">mg/dL</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {GLUCOSE_CONTEXTS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() =>
                          setBaseline((b) => ({
                            ...b,
                            baseline_glucose_context: b.baseline_glucose_context === c.value ? "" : c.value,
                          }))
                        }
                        className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          baseline.baseline_glucose_context === c.value
                            ? "border-medical-500 bg-medical-50 text-medical-800"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="When were you last seen by a doctor for this?" optional>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {LAST_VISIT_OPTIONS.map((o) => {
                    const on = baseline.baseline_last_visit === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() =>
                          setBaseline((b) => ({
                            ...b,
                            baseline_last_visit: b.baseline_last_visit === o.value ? "" : o.value,
                          }))
                        }
                        aria-pressed={on}
                        className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
                          on
                            ? "border-medical-500 bg-medical-50 text-medical-800"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="What are you already doing to look after yourself?" optional>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={baseline.baseline_self_care}
                  onChange={(e) => setBaseline((b) => ({ ...b, baseline_self_care: e.target.value }))}
                  placeholder="e.g. I walk most evenings, I've cut down on salt, I check my BP at the chemist"
                  className={`${inputClass} resize-none`}
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Your doctor builds on what you already do rather than starting from scratch.
                </p>
              </Field>

              <Field label="Anything else your doctor should know?" optional>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={baseline.baseline_notes}
                  onChange={(e) => setBaseline((b) => ({ ...b, baseline_notes: e.target.value }))}
                  placeholder="Other conditions, allergies, symptoms you've noticed…"
                  className={`${inputClass} resize-none`}
                />
              </Field>
            </Section>
          )}

          {step === 3 && (
            <Section
              icon={<ShieldCheck className="h-5 w-5" />}
              title="One payment, one year of care"
              blurb="Check it over, agree to the terms, then pay securely with Paystack."
            >
              <div className="rounded-2xl border border-medical-100 bg-medical-50/60 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-medical-900">Poveon Care Plan</span>
                  <span className="text-2xl font-extrabold text-medical-700">{naira(benefits.price_naira)}</span>
                </div>
                <p className="mt-1 text-xs text-medical-700/80">Billed once, covers you for 12 months.</p>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                  <IncludedLine>Up to {benefits.lab_discount_percent}% off lab tests at partner labs</IncludedLine>
                  <IncludedLine>Up to {benefits.pharmacy_discount_percent}% off medication at partner pharmacies</IncludedLine>
                  <IncludedLine>{benefits.message_allowance} messages to your own doctor</IncludedLine>
                </ul>
              </div>

              <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
                <Row label="Name" value={form.full_name} />
                <Row label="Phone" value={form.phone} />
                {age && <Row label="Age" value={`${age} years`} />}
                <Row
                  label="Managing"
                  value={form.conditions.map((c) => (c === "hypertension" ? "Hypertension" : "Diabetes")).join(", ")}
                />
                {(form.state || form.city) && (
                  <Row label="Location" value={[form.city, form.state].filter(Boolean).join(", ")} />
                )}
                {pharmacy && <Row label="Pharmacy" value={pharmacy.name} />}
                {lab && <Row label="Laboratory" value={lab.name} />}
              </dl>

              {/* Consent — the last thing before payment */}
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => set("consent", e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-medical-600 focus:ring-medical-400"
                />
                <span className="text-xs leading-relaxed text-slate-600">
                  I agree that Poveon may share these details and my care-plan activity with the doctor
                  assigned to me, and with partner labs and pharmacies when I present my care code. I
                  understand the plan is <strong>not emergency care</strong>, runs for 12 months from
                  payment, and stops when it isn&apos;t renewed. See our{" "}
                  <a href="/terms" target="_blank" className="font-semibold text-medical-600 underline">terms</a>{" "}
                  and{" "}
                  <a href="/privacy" target="_blank" className="font-semibold text-medical-600 underline">privacy notice</a>.
                </span>
              </label>

              <p className="flex items-start gap-2 text-xs text-slate-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                Your care code is issued the moment your payment clears, and we&apos;ll match you with a
                doctor straight away.
              </p>
            </Section>
          )}

          {error && (
            <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}
        </div>

        {picking && (
          <ProviderPicker
            kind={picking}
            value={(picking === "pharmacy" ? pharmacy : lab)?.id ?? null}
            onChange={(p) => (picking === "pharmacy" ? setPharmacy(p) : setLab(p))}
            onClose={() => setPicking(null)}
          />
        )}

        {/* Actions */}
        <div
          className="flex shrink-0 items-center gap-3 border-t border-slate-100 bg-white p-4 sm:px-6"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {step > 0 && (
            <button
              type="button"
              onClick={() => { setError(""); setStep((s) => Math.max(0, s - 1)); }}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={!stepValid}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-medical-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-medical-600/25 transition hover:bg-medical-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting || !form.consent}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? "Opening checkout…" : `Pay ${naira(benefits.price_naira)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

function Section({
  icon, title, blurb, children,
}: {
  icon: React.ReactNode; title: string; blurb: string; children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-medical-50 text-medical-600">
          {icon}
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{blurb}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="text-xs font-normal text-slate-400">optional</span>}
      </span>
      {children}
    </div>
  );
}

/** Duration answered in bands — nobody remembers an exact diagnosis date. */
function DurationChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DURATION_OPTIONS.map((o) => {
        const on = value === String(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(on ? "" : String(o.value))}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              on
                ? "border-medical-500 bg-medical-50 text-medical-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ConditionCard({
  active, onClick, icon, title, blurb,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; title: string; blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
        active
          ? "border-medical-500 bg-medical-50 shadow-sm shadow-medical-500/10"
          : "border-slate-200 bg-white hover:border-medical-200"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-medical-600 text-white" : "bg-slate-100 text-slate-400"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-bold ${active ? "text-medical-900" : "text-slate-700"}`}>{title}</p>
        <p className="text-xs text-slate-500">{blurb}</p>
      </div>
      {active && <Check className="ml-auto h-4 w-4 shrink-0 text-medical-600" />}
    </button>
  );
}

function IncludedLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      <span>{children}</span>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <dt className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm font-medium text-slate-700">{value || "—"}</dd>
    </div>
  );
}
