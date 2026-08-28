"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, HeartPulse, Loader2, Droplet, Target,
  ShieldCheck, MapPin, User,
} from "lucide-react";
import { STATE_NAMES } from "@/lib/nigeria-locations";
import { PhoneInput } from "@/components/PhoneInput";

export type SignupSettings = {
  price_naira: number;
  message_allowance: number;
  lab_discount_percent: number;
  pharmacy_discount_percent: number;
};

type Form = {
  full_name: string;
  email: string;
  phone: string;
  sex: "male" | "female" | "";
  date_of_birth: string;
  state: string;
  city: string;
  conditions: string[];
  goal: string;
  goal_metric: string;
};

const EMPTY: Form = {
  full_name: "", email: "", phone: "", sex: "", date_of_birth: "",
  state: "", city: "", conditions: [], goal: "", goal_metric: "",
};

/** Prompts that make the goal question easy to answer rather than daunting. */
const GOAL_IDEAS = [
  "Get my blood pressure under 130/80 and keep it there",
  "Bring my HbA1c below 7%",
  "Walk 30 minutes a day, five days a week",
  "Take my medication every day without missing",
  "Lose 8kg and keep it off",
];

const STEPS = ["You", "Your health", "Your goal", "Confirm"] as const;

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export function CarePlanSignup({ settings }: { settings: SignupSettings }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleCondition = (c: string) =>
    setForm((f) => ({
      ...f,
      conditions: f.conditions.includes(c) ? f.conditions.filter((x) => x !== c) : [...f.conditions, c],
    }));

  // Each step gates the next one, so nobody reaches the payment page with a
  // half-filled form and loses their money to a validation error.
  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return (
          form.full_name.trim().length >= 2 &&
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) &&
          form.phone.replace(/\D/g, "").length >= 10
        );
      case 1:
        return form.conditions.length > 0;
      case 2:
        return form.goal.trim().length >= 3;
      default:
        return true;
    }
  }, [step, form]);

  function next() {
    setError("");
    if (!stepValid) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function back() {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/consults/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          sex: form.sex || null,
          date_of_birth: form.date_of_birth || null,
          state: form.state || null,
          city: form.city || null,
          goal_metric: form.goal_metric || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Straight to Paystack — the return page activates the plan.
      window.location.href = data.authorization_url;
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div id="join" className="mx-auto w-full max-w-xl">
      <div className="overflow-hidden rounded-3xl border border-white/70 bg-white/90 shadow-xl shadow-slate-900/5 backdrop-blur">
        {/* Progress */}
        <div className="border-b border-slate-100 px-5 pt-5 sm:px-7">
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex flex-1 flex-col gap-1.5">
                <div
                  className={`h-1.5 rounded-full transition-colors duration-300 ${
                    i < step ? "bg-emerald-400" : i === step ? "bg-medical-500" : "bg-slate-200"
                  }`}
                />
                <span
                  className={`hidden text-[11px] font-semibold sm:block ${
                    i === step ? "text-medical-700" : "text-slate-400"
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p className="py-3 text-xs font-semibold text-slate-400 sm:hidden">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          {step === 0 && (
            <StepShell
              icon={<User className="h-5 w-5" />}
              title="Let's start with you"
              blurb="We'll send your care code and your doctor's replies here."
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
              <Field label="Email address">
                <input
                  type="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </Field>
              <Field label="Phone number">
                <PhoneInput value={form.phone} onChange={(v) => set("phone", v)} />
              </Field>
            </StepShell>
          )}

          {step === 1 && (
            <StepShell
              icon={<HeartPulse className="h-5 w-5" />}
              title="What are you managing?"
              blurb="Pick everything that applies. Your doctor sees this first."
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

              <div className="grid gap-4 sm:grid-cols-2">
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
                <Field label="Date of birth" optional>
                  <input
                    type="date"
                    value={form.date_of_birth}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => set("date_of_birth", e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="State" optional>
                  <select value={form.state} onChange={(e) => set("state", e.target.value)} className={inputClass}>
                    <option value="">Select a state</option>
                    {STATE_NAMES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Town or city" optional>
                  <input
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="e.g. Ikeja"
                    className={inputClass}
                  />
                </Field>
              </div>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              icon={<Target className="h-5 w-5" />}
              title="What's your goal for the year?"
              blurb="One thing you want to be true a year from now. Your doctor will hold you to it."
            >
              <Field label="My goal">
                <textarea
                  autoFocus
                  rows={3}
                  maxLength={500}
                  value={form.goal}
                  onChange={(e) => set("goal", e.target.value)}
                  placeholder="In one year, I want to…"
                  className={`${inputClass} resize-none`}
                />
              </Field>

              <div className="flex flex-wrap gap-2">
                {GOAL_IDEAS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => set("goal", idea)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-medical-300 hover:bg-medical-50 hover:text-medical-800"
                  >
                    {idea}
                  </button>
                ))}
              </div>

              <Field label="How will you know you got there?" optional>
                <input
                  value={form.goal_metric}
                  onChange={(e) => set("goal_metric", e.target.value)}
                  placeholder="e.g. My home BP readings stay under 130/80 for three months"
                  className={inputClass}
                />
              </Field>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell
              icon={<ShieldCheck className="h-5 w-5" />}
              title="One payment, one year of care"
              blurb="Check your details, then pay securely with Paystack."
            >
              <div className="rounded-2xl border border-medical-100 bg-medical-50/60 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-medical-900">Poveon Care Plan</span>
                  <span className="text-2xl font-extrabold text-medical-700">{naira(settings.price_naira)}</span>
                </div>
                <p className="mt-1 text-xs text-medical-700/80">Billed once, covers you for 12 months.</p>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
                  <IncludedLine>{settings.lab_discount_percent}% off lab tests at partner labs</IncludedLine>
                  <IncludedLine>{settings.pharmacy_discount_percent}% off prescriptions at partner pharmacies</IncludedLine>
                  <IncludedLine>{settings.message_allowance} messages to your own doctor</IncludedLine>
                </ul>
              </div>

              <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
                <Row label="Name" value={form.full_name} />
                <Row label="Email" value={form.email} />
                <Row label="Phone" value={form.phone} />
                <Row
                  label="Managing"
                  value={form.conditions.map((c) => (c === "hypertension" ? "Hypertension" : "Diabetes")).join(", ")}
                />
                <Row label="Goal" value={form.goal} />
                {form.state ? <Row label="Location" value={[form.city, form.state].filter(Boolean).join(", ")} /> : null}
              </dl>

              <p className="flex items-start gap-2 text-xs text-slate-500">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                We'll match you with a doctor as soon as your payment clears, and email you their first assessment.
              </p>
            </StepShell>
          )}

          {error && (
            <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
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
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {submitting ? "Opening checkout…" : `Pay ${naira(settings.price_naira)}`}
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        Already a member?{" "}
        <a href="/consults/login" className="font-semibold text-medical-600 hover:underline">
          Sign in to see your code
        </a>
      </p>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

function StepShell({
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
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{blurb}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="text-xs font-normal text-slate-400">optional</span>}
      </span>
      {children}
    </label>
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
