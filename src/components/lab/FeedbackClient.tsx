"use client";

import { useState } from "react";
import { Check, Loader2, Star, User, MessageSquare } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";
const labelCls = "mb-1 block text-xs font-medium text-slate-600";

const ASPECTS = [
  { key: "rating_accuracy", label: "Test accuracy" },
  { key: "rating_speed", label: "Speed / turnaround" },
  { key: "rating_staff", label: "Staff & professionalism" },
  { key: "rating_environment", label: "Cleanliness & environment" },
] as const;

type AspectKey = (typeof ASPECTS)[number]["key"];

/** Tappable 1–5 star row. */
function StarRow({ value, onChange, size = "md" }: { value: number; onChange: (v: number) => void; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "h-9 w-9" : "h-6 w-6";
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(i)} className="transition-transform active:scale-90" aria-label={`${i} star${i > 1 ? "s" : ""}`}>
          <Star className={`${cls} ${i <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
        </button>
      ))}
    </div>
  );
}

/**
 * Two-step public feedback flow: the visitor identifies with name + email,
 * then rates the lab (overall required, aspects optional) and can leave a
 * comment. Submissions land in the lab's Feedback tab tagged as QR feedback.
 */
export function FeedbackClient({ labId, labName }: { labId: string; labName: string }) {
  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [overall, setOverall] = useState(0);
  const [aspects, setAspects] = useState<Record<AspectKey, number>>({
    rating_accuracy: 0,
    rating_speed: 0,
    rating_staff: 0,
    rating_environment: 0,
  });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const identityValid = name.trim().length > 0 && EMAIL_RE.test(email.trim());

  async function submit() {
    if (overall === 0) { setError("Please give an overall star rating."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${labId}/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          rating_overall: overall,
          rating_accuracy: aspects.rating_accuracy || null,
          rating_speed: aspects.rating_speed || null,
          rating_staff: aspects.rating_staff || null,
          rating_environment: aspects.rating_environment || null,
          comment: comment.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not submit your feedback");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <Check className="h-7 w-7 text-emerald-600" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Thank you, {name.trim().split(/\s+/)[0]}!</h3>
        <p className="mt-1 text-sm text-slate-500">
          Your feedback has been shared with {labName}. It helps them serve you and every other client better.
        </p>
        <div className="mt-4 flex items-center justify-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className={`h-6 w-6 ${i <= overall ? "fill-amber-400 text-amber-400" : "text-slate-200"}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-5 flex items-center gap-2">
        {[{ label: "About you", icon: User }, { label: "Your feedback", icon: MessageSquare }].map((s, i) => {
          const Icon = s.icon;
          const active = step === i;
          const stepDone = step > i;
          return (
            <div key={s.label} className="flex flex-1 items-center gap-2 last:flex-none">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full ${stepDone ? "bg-emerald-500 text-white" : active ? "bg-medical-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                {stepDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-xs font-medium ${active ? "text-slate-900" : "text-slate-400"}`}>{s.label}</span>
              {i === 0 && <div className={`h-0.5 flex-1 rounded ${stepDone ? "bg-emerald-400" : "bg-slate-100"}`} />}
            </div>
          );
        })}
      </div>

      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {step === 0 && (
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Your name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada Okafor" autoComplete="name" />
          </div>
          <div>
            <label className={labelCls}>Your email *</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" inputMode="email" autoComplete="email" />
            {email.trim().length > 0 && !EMAIL_RE.test(email.trim()) && (
              <p className="mt-1 text-[11px] font-medium text-red-600">Enter a valid email address</p>
            )}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Your email is only used to identify your review — it isn&apos;t shown publicly or shared.
          </p>
          <button
            onClick={() => { setError(null); setStep(1); }}
            disabled={!identityValid}
            className="mt-1 w-full rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="mb-2 text-sm font-semibold text-slate-800">How was your overall experience? *</p>
            <div className="flex justify-center">
              <StarRow value={overall} onChange={(v) => { setOverall(v); setError(null); }} size="lg" />
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Rate the details (optional)</p>
            {ASPECTS.map((a) => (
              <div key={a.key} className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-600">{a.label}</p>
                <StarRow value={aspects[a.key]} onChange={(v) => setAspects((prev) => ({ ...prev, [a.key]: v }))} />
              </div>
            ))}
          </div>

          <div>
            <label className={labelCls}>Anything you&apos;d like to tell us? (optional)</label>
            <textarea className={inputCls} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What went well, or what we can improve" maxLength={1000} />
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Back</button>
            <button
              onClick={submit}
              disabled={submitting || overall === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit feedback
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
