"use client";

/**
 * The member's symptom check-in.
 *
 * One question at a time, tapped rather than typed, with the group it belongs
 * to shown as an icon so a member can see they are being asked about their
 * heart, then their nerves, then their feet — not filling in a form. Answering
 * moves straight on, so the whole round is as many taps as there are questions.
 *
 * Two things are deliberate:
 *
 *  - **Urgent answers are not scored quietly.** Pick one and the advice appears
 *    on the spot, in the member's own words, before the round is even finished.
 *    Waiting for a doctor to read it later is the wrong answer for chest pain
 *    at rest.
 *  - **Nothing is required.** Skipping is a real option on every question; a
 *    blank answer is better than a guessed one, and a member who feels trapped
 *    stops answering honestly.
 */

import { useMemo, useState } from "react";
import {
  Activity, ArrowLeft, Check, Eye, Footprints, HeartPulse, Loader2, PartyPopper,
  ShieldAlert, Sparkles, Waves, Zap,
} from "lucide-react";
import { Modal } from "@/components/ui/Overlay";
import { SEVERITY_TONE, type ScreeningQuestion, type SymptomSeverity } from "@/lib/screening";

const GROUP_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  heart: HeartPulse,
  nerves: Zap,
  eyes: Eye,
  kidneys: Waves,
  feet: Footprints,
  general: Activity,
};

const GROUP_TINT: Record<string, string> = {
  heart: "from-rose-500 to-rose-600",
  nerves: "from-violet-500 to-violet-600",
  eyes: "from-sky-500 to-sky-600",
  kidneys: "from-cyan-500 to-cyan-600",
  feet: "from-amber-500 to-amber-600",
  general: "from-emerald-500 to-emerald-600",
};

type Result = {
  severity: SymptomSeverity;
  flagged: { key: string; prompt: string; label: string; severity: SymptomSeverity }[];
  advice: string[];
};

export function ScreeningCheckin({
  open,
  questions,
  source = "routine",
  onClose,
  onDone,
}: {
  open: boolean;
  questions: ScreeningQuestion[];
  source?: "onboarding" | "routine";
  onClose: () => void;
  onDone?: (result: Result) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState<"next" | "back">("next");
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const total = questions.length;
  const question = questions[step];
  const progress = total ? Math.round((step / total) * 100) : 0;

  // The advice for whatever they have just picked, shown before they move on.
  const liveAdvice = useMemo(() => {
    if (!question || !picked) return null;
    const option = question.options.find((o) => o.value === picked);
    return option?.severity === "urgent" ? question.urgentAdvice ?? null : null;
  }, [question, picked]);

  function reset() {
    setStep(0);
    setAnswers({});
    setPicked(null);
    setResult(null);
    setError("");
    setDirection("next");
  }

  function advance(next: Record<string, string>) {
    if (step + 1 >= total) {
      void submit(next);
      return;
    }
    setDirection("next");
    setStep((s) => s + 1);
    setPicked(null);
  }

  function choose(value: string) {
    if (!question || saving) return;
    const next = { ...answers, [question.key]: value };
    setAnswers(next);
    setPicked(value);

    // An urgent answer holds the screen — they read the advice, then continue.
    const option = question.options.find((o) => o.value === value);
    if (option?.severity === "urgent" && question.urgentAdvice) return;

    // A short beat so the tick registers before the card slides away.
    window.setTimeout(() => advance(next), 260);
  }

  function skip() {
    if (!question) return;
    const next = { ...answers };
    delete next[question.key];
    setAnswers(next);
    setPicked(null);
    advance(next);
  }

  function back() {
    if (step === 0) return;
    setDirection("back");
    setStep((s) => s - 1);
    setPicked(null);
  }

  async function submit(final: Record<string, string>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/consults/screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: final, source }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        setError(d?.error ?? "We could not save your answers.");
        return;
      }
      const done: Result = {
        severity: d.round.severity,
        flagged: d.round.flagged ?? [],
        advice: d.advice ?? [],
      };
      setResult(done);
      onDone?.(done);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function close() {
    reset();
    onClose();
  }

  const Icon = question ? GROUP_ICON[question.group] ?? Activity : Activity;
  const tint = question ? GROUP_TINT[question.group] ?? GROUP_TINT.general : GROUP_TINT.general;

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={result ? "All done" : "Your check-in"}
      subtitle={
        result
          ? undefined
          : total
            ? `Question ${Math.min(step + 1, total)} of ${total} · tap an answer`
            : undefined
      }
      footer={
        result ? (
          <button
            onClick={close}
            className="w-full rounded-xl bg-medical-600 py-3 text-sm font-bold text-white transition hover:bg-medical-700"
          >
            Done
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={back}
              disabled={step === 0 || saving}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 disabled:opacity-40"
              aria-label="Previous question"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {liveAdvice ? (
              <button
                onClick={() => advance(answers)}
                className="flex-1 rounded-xl bg-medical-600 py-3 text-sm font-bold text-white transition hover:bg-medical-700"
              >
                I understand — continue
              </button>
            ) : (
              <button
                onClick={skip}
                disabled={saving}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 transition hover:border-slate-300 disabled:opacity-40"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                  </span>
                ) : (
                  "Skip this one"
                )}
              </button>
            )}
          </div>
        )
      }
    >
      {result ? (
        <ResultCard result={result} />
      ) : question ? (
        <div>
          {/* Progress — the only thing that stays put between questions. */}
          <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-medical-400 to-medical-600 transition-all duration-500 ease-out"
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>

          <div
            key={question.key}
            className={direction === "next" ? "animate-screen-next" : "animate-screen-back"}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tint} text-white shadow-lg`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="text-base font-bold leading-snug text-slate-900">{question.prompt}</p>
                {question.hint && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{question.hint}</p>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {question.options.map((option, i) => {
                const chosen = picked === option.value || answers[question.key] === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => choose(option.value)}
                    style={{ animationDelay: `${60 + i * 55}ms` }}
                    className={`animate-screen-opt flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition ${
                      chosen
                        ? "border-medical-500 bg-medical-50"
                        : "border-slate-200 bg-white hover:border-medical-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                        chosen ? "border-medical-500 bg-medical-500" : "border-slate-200"
                      }`}
                    >
                      {chosen && <Check className="animate-screen-pick h-3.5 w-3.5 text-white" />}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{option.label}</span>
                  </button>
                );
              })}
            </div>

            {liveAdvice && (
              <div className="animate-screen-pick mt-4 flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <p className="text-xs font-semibold leading-relaxed text-red-700">{liveAdvice}</p>
              </div>
            )}

            {error && <p className="mt-3 text-center text-xs font-semibold text-red-500">{error}</p>}
          </div>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">Nothing to ask right now.</p>
      )}
    </Modal>
  );
}

function ResultCard({ result }: { result: Result }) {
  const tone = SEVERITY_TONE[result.severity];
  const clear = result.severity === "none";

  return (
    <div className="text-center">
      <div
        className={`animate-screen-done mx-auto flex h-16 w-16 items-center justify-center rounded-3xl ${tone.bg} ${tone.text}`}
      >
        {clear ? <PartyPopper className="h-8 w-8" /> : <Sparkles className="h-8 w-8" />}
      </div>

      <h3 className="mt-4 text-lg font-bold text-slate-900">
        {clear ? "Nothing to worry about today" : "Thanks — your doctor will see this"}
      </h3>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-slate-500">
        {clear
          ? "You reported no new symptoms. We'll ask again next month."
          : "You mentioned a few things worth a look. They're on your doctor's list now."}
      </p>

      {result.advice.length > 0 && (
        <div className="mt-5 space-y-2 text-left">
          {result.advice.map((line) => (
            <div
              key={line}
              className="flex items-start gap-3 rounded-2xl border-2 border-red-200 bg-red-50 p-4"
            >
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <p className="text-xs font-semibold leading-relaxed text-red-700">{line}</p>
            </div>
          ))}
        </div>
      )}

      {result.flagged.length > 0 && (
        <div className="mt-5 space-y-1.5 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            What you told us
          </p>
          {result.flagged.map((f) => {
            const t = SEVERITY_TONE[f.severity];
            return (
              <div
                key={f.key}
                className={`flex items-start gap-2.5 rounded-xl border ${t.border} ${t.bg} px-3 py-2.5`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.dot}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700">{f.prompt}</p>
                  <p className={`text-xs ${t.text}`}>{f.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
