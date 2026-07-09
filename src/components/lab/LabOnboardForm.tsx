"use client";

import { useState } from "react";
import { User, FlaskConical, ShieldCheck, Check, Loader2, Copy, Search, Stethoscope, Lock, HelpCircle, MessageCircle } from "lucide-react";
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

const REFERRAL_OPTIONS = [
  { value: "self", label: "Self referred" },
  { value: "doctor", label: "Referred by doctor / hospital" },
  { value: "hmo", label: "Referred by HMO" },
] as const;

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
  { value: "bill_hospital", label: "Bill to my hospital" },
] as const;

/**
 * Minimalist multi-step client onboarding form. Used by the public QR page
 * (`/o/[labSlug]`, source="qr") and the dashboard walk-in flow (source="walk_in").
 * The QR flow collects the full self-service queue intake (referral type,
 * split names, DOB, WhatsApp, complaint, payment mode) and never shows prices.
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
  const isQr = source === "qr";
  const [step, setStep] = useState<Step>(0);
  // Walk-in keeps a single name field; QR splits surname / first / middle.
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneIsWhatsapp, setPhoneIsWhatsapp] = useState<"" | "yes" | "no">("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [dob, setDob] = useState("");
  const [sex, setSex] = useState("");
  const [referralType, setReferralType] = useState<"" | "self" | "doctor" | "hmo">("");
  const [doctorNameText, setDoctorNameText] = useState("");
  const [referringOrg, setReferringOrg] = useState("");
  const [paymentMode, setPaymentMode] = useState<"" | "cash" | "card" | "transfer" | "bill_hospital">("");
  const [complaintHelpOpen, setComplaintHelpOpen] = useState(false);
  const [tests, setTests] = useState<TestTag[]>([]);
  const [condition, setCondition] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  // Referring doctor (manual path) — picked from the lab's pool (walk-in only).
  const [doctor, setDoctor] = useState<PickedDoctor | null>(null);
  const canAddDoctor = source === "walk_in"; // front desk can add; public QR uses free text

  // "I have a Poveon code" reveal-and-confirm path. Both QR self-service and
  // front-desk manual registration lead with the code prompt; "New
  // registration" is one toggle away for walk-ins without a code.
  const [entryMode, setEntryMode] = useState<"code" | "manual">("code");
  const [lookupCode, setLookupCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [revealed, setRevealed] = useState<{ code: string; tests: string; doctor_name: string | null } | null>(null);

  const fullName = isQr
    ? [firstName.trim(), middleName.trim(), surname.trim()].filter(Boolean).join(" ")
    : name.trim();

  const detailsValid = isQr
    ? !!referralType &&
      surname.trim().length > 0 &&
      firstName.trim().length > 0 &&
      dob.trim().length > 0 &&
      sex.trim().length > 0 &&
      phone.trim().length >= 5 &&
      phoneIsWhatsapp !== ""
    : name.trim().length > 0 && phone.trim().length >= 5;

  const referralValid = !isQr
    ? true
    : referralType === "doctor"
    ? doctorNameText.trim().length > 0
    : referralType === "hmo"
    ? referringOrg.trim().length > 0
    : true;

  const testsValid = tests.length > 0 && (!isQr || (!!paymentMode && referralValid));

  // Running cost estimate from catalog-priced tests — shown to front-desk staff
  // only. The public QR flow hides all prices from patients.
  const knownTotal = tests.reduce((s, t) => s + (typeof t.price === "number" ? t.price : 0), 0);
  const hasUnpriced = tests.some((t) => typeof t.price !== "number");
  const showPrices = source === "walk_in";

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
          patient_name: fullName,
          patient_phone: phone.trim(),
          patient_email: email.trim() || undefined,
          patient_age: age ? Number(age) : undefined,
          dob: isQr && dob ? dob : undefined,
          sex: sex || undefined,
          tests: tests.map((t) => t.name).join(", "),
          condition: condition.trim() || undefined,
          professional_id: doctor?.id,
          referral_type: isQr && referralType ? referralType : undefined,
          whatsapp_phone: isQr && phoneIsWhatsapp === "no" ? whatsapp.trim() || undefined : undefined,
          referring_doctor_name: isQr && referralType !== "self" ? doctorNameText.trim() || undefined : undefined,
          referring_org: isQr ? referringOrg.trim() || undefined : undefined,
          payment_mode: isQr && paymentMode ? paymentMode : undefined,
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
        <p className="mt-1 text-sm text-slate-500">
          {isQr
            ? `You've been added to the waiting list at ${lab.name}. The team will confirm your details and call you in order of arrival.`
            : `Show this code at ${lab.name}.`}
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-2xl font-bold tracking-wider text-medical-700">{code}</span>
          <button onClick={() => navigator.clipboard?.writeText(code)} className="text-slate-400 hover:text-slate-600" title="Copy code">
            <Copy className="h-4 w-4" />
          </button>
        </div>
        {isQr && email.trim() && (
          <p className="mt-3 text-xs text-slate-400">A confirmation has also been sent to your email.</p>
        )}
      </div>
    );
  }

  const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600";

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
            <label className={labelCls}>Full name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Phone number *</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Age</label>
              <input className={inputCls} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
            </div>
            <div>
              <label className={labelCls}>Sex</label>
              <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Email (optional)</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="text-xs font-medium text-slate-500">Tests requested</p>
            <p className="mt-0.5 text-slate-700">{revealed.tests || "—"}</p>
            {revealed.doctor_name && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500"><Stethoscope className="h-3.5 w-3.5" /> Referred by {revealed.doctor_name} <Lock className="h-3 w-3" /></p>
            )}
          </div>
          <button type="button" onClick={confirmDetails} disabled={confirming || (name.trim().length === 0 || phone.trim().length < 5)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
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

      {step === 0 && !isQr && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Full name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <label className={labelCls}>Phone number *</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..." inputMode="tel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Age</label>
              <input className={inputCls} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 34" inputMode="numeric" />
            </div>
            <div>
              <label className={labelCls}>Sex</label>
              <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Email (optional)</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" inputMode="email" />
          </div>
          <div>
            <label className={labelCls}>Referring doctor (optional)</label>
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

      {step === 0 && isQr && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>How were you referred? *</label>
            <div className="grid grid-cols-1 gap-1.5">
              {REFERRAL_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setReferralType(o.value)}
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
          <div>
            <label className={labelCls}>Surname *</label>
            <input className={inputCls} value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="e.g. Okafor" autoComplete="family-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First name *</label>
              <input className={inputCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Ada" autoComplete="given-name" />
            </div>
            <div>
              <label className={labelCls}>Middle name</label>
              <input className={inputCls} value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Optional" autoComplete="additional-name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date of birth *</label>
              <input type="date" className={inputCls} value={dob} onChange={(e) => setDob(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
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
          <div>
            <label className={labelCls}>Phone number *</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..." inputMode="tel" autoComplete="tel" />
          </div>
          <div>
            <label className={labelCls}>Is this number on WhatsApp? *</label>
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
          </div>
          {phoneIsWhatsapp === "no" && (
            <div>
              <label className={labelCls}>WhatsApp number (optional)</label>
              <input className={inputCls} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+234..." inputMode="tel" />
            </div>
          )}
          <div>
            <label className={labelCls}>Email (optional)</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" inputMode="email" autoComplete="email" />
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
          {isQr && referralType !== "self" && (
            <>
              <div>
                <label className={labelCls}>Referring doctor&apos;s name {referralType === "doctor" ? "*" : ""}</label>
                <input className={inputCls} value={doctorNameText} onChange={(e) => setDoctorNameText(e.target.value)} placeholder="e.g. Dr. John Ade" />
              </div>
              <div>
                <label className={labelCls}>Referring hospital / HMO / company {referralType === "hmo" ? "*" : ""}</label>
                <input className={inputCls} value={referringOrg} onChange={(e) => setReferringOrg(e.target.value)} placeholder="e.g. St. Mary's Hospital or Hygeia HMO" />
              </div>
            </>
          )}
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
            <label className={labelCls}>Tests / investigations *</label>
            <TestTagInput value={tests} onChange={setTests} labId={lab.id} />
          </div>
          {showPrices && tests.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="flex justify-between font-medium text-slate-800">
                <span>Estimated total</span>
                <span className="tabular-nums">₦{Math.round(knownTotal).toLocaleString()}{hasUnpriced ? "+" : ""}</span>
              </div>
              {hasUnpriced && <p className="mt-0.5 text-[11px] text-slate-400">Some tests aren&rsquo;t price-listed yet — the lab confirms the final total.</p>}
            </div>
          )}
          <div>
            <label className={`${labelCls} flex items-center gap-1.5`}>
              {isQr ? "Complaint (optional)" : "Symptoms / notes (optional)"}
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
                Briefly describe what&apos;s bothering you or why you&apos;re doing these tests — e.g. &ldquo;fever and headache for 3 days&rdquo; or &ldquo;routine annual check-up&rdquo;. This helps the lab team serve you better.
              </p>
            )}
            <textarea className={inputCls} rows={3} value={condition} onChange={(e) => setCondition(e.target.value)} placeholder={isQr ? "e.g. Fever and headache for 3 days" : "Anything the lab should know"} />
          </div>
          {isQr && (
            <div>
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
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
            <button onClick={() => setStep(2)} disabled={!testsValid} className="flex-1 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">Continue</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-medium text-slate-900">
              {fullName}
              {isQr && dob && <span className="text-slate-400"> · {dob}</span>}
              {!isQr && age && <span className="text-slate-400"> · {age}y</span>}
              {sex && <span className="text-slate-400"> · {sex}</span>}
            </p>
            <p className="text-slate-500">{phone}{isQr && phoneIsWhatsapp === "no" && whatsapp ? ` · WhatsApp: ${whatsapp}` : ""}{email ? ` · ${email}` : ""}</p>
            {isQr && referralType && (
              <p className="mt-1 text-xs text-slate-500">
                {REFERRAL_OPTIONS.find((o) => o.value === referralType)?.label}
                {referralType !== "self" && (doctorNameText.trim() || referringOrg.trim()) ? ` — ${[doctorNameText.trim(), referringOrg.trim()].filter(Boolean).join(", ")}` : ""}
              </p>
            )}
            <p className="mt-2 text-slate-700">{tests.map((t) => t.name).join(", ")}</p>
            {isQr && paymentMode && (
              <p className="mt-1 text-xs text-slate-500">Payment: {PAYMENT_OPTIONS.find((o) => o.value === paymentMode)?.label}</p>
            )}
            {showPrices && (
              <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                <span>Estimated total</span>
                <span className="tabular-nums">₦{Math.round(knownTotal).toLocaleString()}{hasUnpriced ? "+" : ""}</span>
              </div>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-medical-600" />
            <span>I consent to {lab.name} collecting and processing my samples and personal data for the requested tests.</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
            <button onClick={submit} disabled={!consent || submitting} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {source === "walk_in" ? "Register client" : "Join the queue"}
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
