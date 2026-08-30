"use client";

/**
 * The prompt that gets a check-in answered.
 *
 * Deliberately loud when a round is due and quiet when it is not: a member who
 * is up to date sees when they were last asked and nothing more, and a member
 * who is due sees a card that is hard to walk past. The questions themselves
 * only load once they tap — there is no reason to pull a question set for
 * someone who is not being asked anything.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CalendarCheck, ClipboardList, Loader2, Sparkles } from "lucide-react";
import { SEVERITY_TONE, type ScreeningQuestion, type SymptomSeverity } from "@/lib/screening";

const ScreeningCheckin = dynamic(
  () => import("@/components/consults/ScreeningCheckin").then((m) => m.ScreeningCheckin),
  { ssr: false }
);

type Last = {
  severity: SymptomSeverity;
  flagged: string[];
  due_on: string;
  created_at: string;
};

function whenDue(iso: string): string {
  const due = new Date(iso);
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "due now";
  if (days === 1) return "due tomorrow";
  if (days < 14) return `due in ${days} days`;
  return `due ${due.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
}

export function ScreeningCard() {
  const [due, setDue] = useState(false);
  const [questions, setQuestions] = useState<ScreeningQuestion[]>([]);
  const [last, setLast] = useState<Last | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/consults/screening");
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) return;
      setDue(!!d.due);
      setQuestions(d.questions ?? []);
      setLast(d.last ?? null);
    } catch {
      /* a check-in prompt is not worth an error message */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />;
  }

  const tone = last ? SEVERITY_TONE[last.severity] : null;

  return (
    <>
      {due ? (
        <button
          onClick={() => setOpen(true)}
          className="group w-full overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 p-5 text-left text-white shadow-lg shadow-indigo-500/20 transition hover:shadow-xl"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 transition group-hover:scale-105">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {last ? "Time for your check-in" : "Your first check-in"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/80">
                {questions.length} quick questions about how you&apos;ve been. Tap the answers — it
                takes about a minute, and it&apos;s how your doctor catches things early.
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold">
                <Sparkles className="h-3.5 w-3.5" /> Start
              </span>
            </div>
          </div>
        </button>
      ) : (
        last && (
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone?.bg} ${tone?.text}`}
              >
                <CalendarCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700">
                  {last.severity === "none"
                    ? "You reported no new symptoms"
                    : `${last.flagged.length} thing${last.flagged.length === 1 ? "" : "s"} passed to your doctor`}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Last checked{" "}
                  {new Date(last.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                  })}
                  {" · next "}
                  {whenDue(last.due_on)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(true)}
              className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-500 transition hover:border-medical-300 hover:text-medical-600"
            >
              Answer again anyway
            </button>
          </div>
        )
      )}

      {open && questions.length > 0 && (
        <ScreeningCheckin
          open={open}
          questions={questions}
          onClose={() => { setOpen(false); void load(); }}
        />
      )}
    </>
  );
}

/** Shown while the questions are still coming down, so the card never jumps. */
export function ScreeningCardSkeleton() {
  return (
    <div className="flex h-28 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50">
      <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
    </div>
  );
}
