"use client";

import { useState } from "react";
import { User, FlaskConical, ShieldCheck, Check, Loader2, Copy, Search, ArrowRight, Stethoscope, Lock } from "lucide-react";
import { TestTagInput, TestTag } from "@/components/ui/TestTagInput";
import { DoctorSearchSelect, PickedDoctor } from "@/components/lab/DoctorSearchSelect";

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
  { label: "Tests", icon: FlaskConical },
  { label: "Consent", icon: ShieldCheck },
];

/**
 * Minimalist multi-step client onboarding form. Used by the public QR page
 * (`/o/[labSlug]`, source="qr") and the dashboard walk-in flow (source="walk_in").
 */
export function LabOnboardForm({
  lab,
  source,
  templates = [],
  onSuccess,
}: {
  lab: OnboardLab;
  source: "qr" | "walk_in";
  templates?: OnboardTemplate[];
  onSuccess?: (code: string) => void;
}) {
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [tests, setTests] = useState<TestTag[]>([]);
  const [condition, setCondition] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  // Referring doctor (manual path) — picked from the lab's pool.
  const [doctor, setDoctor] = useState<PickedDoctor | null>(null);
  const canAddDoctor = source === "walk_in"; // front desk can add; public QR is search-only

  // "I have a Poveon code" reveal-and-confirm path.
  const [entryMode, setEntryMode] = useState<"code" | "manual">(source === "qr" ? "code" : "manual");
  const [lookupCode, setLookupCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revealed, setRevealed] = useState<{ code: string; tests: string; doctor_name: string | null } | null>(null);

  const detailsValid = name.trim().length > 0 && phone.trim().length >= 5;
  const testsValid = tests.length > 0;

  // Running cost estimate from catalog-priced tests (free-text tests are unpriced).
  const knownTotal = tests.reduce((s, t) => s + (typeof t.price === "number" ? t.price : 0), 0);
  const hasUnpriced = tests.some((t) => typeof t.price !== "number");

  function addTemplate(t: OnboardTemplate) {
    const existing = new Set(tests.map((x) => x.name.toLowerCase()));
    const additions = t.test_names
      .filter((n) => !existing.has(n.toLowerCase()))
      .map((n) => ({ name: n, catalog_test_id: null }));
    setTests([...tests, ...additions]);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboard/lab-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab_id: lab.id,
          lab_slug: lab.slug,
          source,
          patient_name: name.trim(),
          patient_phone: phone.trim(),
          patient_email: email.trim() || undefined,
          patient_age: age ? Number(age) : undefined,
          sex: sex || undefined,
          tests: tests.map((t) => t.name).join(", "),
          condition: condition.trim() || undefined,
          professional_id: doctor?.id,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Submission failed");
      setCode(data.code);
      onSuccess?.(data.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // Reveal an existing Poveon request by code so the client can confirm details.
  async function reveal() {
    const c = lookupCode.trim().toUpperCase();
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
      setName(r.patient_name ?? "");
      setPhone(r.patient_phone ?? "");
      setEmail(r.patient_email ?? "");
      setAge(r.patient_age != null ? String(r.patient_age) : "");
      setSex((r.sex ?? "").toLowerCase());
      setRevealed({ code: r.code, tests: r.tests ?? "", doctor_name: r.doctor_name ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLooking(false);
    }
  }

  // Confirm the revealed details and submit (updates the existing request).
  async function confirmDetails() {
    if (!revealed) return;
    setConfirming(true); setError(null);
    try {
      const res = await fetch("/api/onboard/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab_id: lab.id,
          lab_slug: lab.slug,
          code: revealed.code,
          patient_name: name.trim(),
          patient_phone: phone.trim(),
          patient_email: email.trim() || undefined,
          patient_age: age ? Number(age) : undefined,
          sex: sex || undefined,
          consent: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not confirm");
      setCode(data.code);
      onSuccess?.(data.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not confirm");
    } finally {
      setConfirming(false);
    }
  }

  if (code) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">You&apos;re registered!</h3>
        <p className="mt-1 text-sm text-slate-500">Show this code at {lab.name}.</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-2xl font-bold tracking-wider text-medical-700">{code}</span>
          <button onClick={() => navigator.clipboard?.writeText(code)} className="text-slate-400 hover:text-slate-600" title="Copy code">
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";

  return (
    <div>
      {/* Entry mode toggle */}
      <div className="mb-4 inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
        {([["code", "I have a Poveon code"], ["manual", "New registration"]] as const).map(([m, label]) => (
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
            <button type="button" onClick={reveal} disabled={looking || !lookupCode.trim()} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-medical-600 px-4 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find
            </button>
          </div>
        </div>
      )}

      {entryMode === "code" && revealed && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Full name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Phone number *</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Age</label>
              <input className={inputCls} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Sex</label>
              <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email (optional)</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="text-xs font-medium text-slate-500">Tests requested</p>
            <p className="mt-0.5 text-slate-700">{revealed.tests || "—"}</p>
            {revealed.doctor_name && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500"><Stethoscope className="h-3.5 w-3.5" /> Referred by {revealed.doctor_name} <Lock className="h-3 w-3" /></p>
            )}
          </div>
          <button type="button" onClick={confirmDetails} disabled={confirming || !detailsValid} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm &amp; send
          </button>
        </div>
      )}

      {/* Manual path */}
      {entryMode === "manual" && (<>
      {/* Stepper */}
      <div className="mb-5 flex items-center gap-2">
        {STEP_META.map((s, i) => {
          const Icon = s.icon;
          const active = step === i;
          const done = step > i;
          return (
            <div key={s.label} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${done ? "bg-emerald-500 text-white" : active ? "bg-medical-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`hidden sm:block text-xs font-medium ${active ? "text-slate-900" : "text-slate-400"}`}>{s.label}</span>
              {i < STEP_META.length - 1 && <div className={`h-0.5 flex-1 rounded ${done ? "bg-emerald-400" : "bg-slate-100"}`} />}
            </div>
          );
        })}
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Full name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Phone number *</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..." inputMode="tel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Age</label>
              <input className={inputCls} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 34" inputMode="numeric" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Sex</label>
              <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email (optional)</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" inputMode="email" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Referring doctor (optional)</label>
            <DoctorSearchSelect labId={lab.id} canAdd={canAddDoctor} value={doctor} onChange={setDoctor} />
          </div>
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
          {templates.length > 0 && (
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
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tests / investigations *</label>
            <TestTagInput value={tests} onChange={setTests} labId={lab.id} />
          </div>
          {tests.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="flex justify-between font-medium text-slate-800">
                <span>Estimated total</span>
                <span className="tabular-nums">₦{Math.round(knownTotal).toLocaleString()}{hasUnpriced ? "+" : ""}</span>
              </div>
              {hasUnpriced && <p className="mt-0.5 text-[11px] text-slate-400">Some tests aren&rsquo;t price-listed yet — the lab confirms the final total.</p>}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Symptoms / notes (optional)</label>
            <textarea className={inputCls} rows={3} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Anything the lab should know" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
            <button onClick={() => setStep(2)} disabled={!testsValid} className="flex-1 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">Continue</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-medium text-slate-900">{name} {age && <span className="text-slate-400">· {age}y</span>} {sex && <span className="text-slate-400">· {sex}</span>}</p>
            <p className="text-slate-500">{phone}{email ? ` · ${email}` : ""}</p>
            <p className="mt-2 text-slate-700">{tests.map((t) => t.name).join(", ")}</p>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>Estimated total</span>
              <span className="tabular-nums">₦{Math.round(knownTotal).toLocaleString()}{hasUnpriced ? "+" : ""}</span>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-medical-600" />
            <span>I consent to {lab.name} collecting and processing my samples and personal data for the requested tests.</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
            <button onClick={submit} disabled={!consent || submitting} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {source === "walk_in" ? "Register client" : "Submit"}
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
