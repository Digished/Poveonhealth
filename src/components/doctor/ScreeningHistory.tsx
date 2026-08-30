"use client";

/**
 * What the member has been reporting, round by round.
 *
 * The newest round is open, older ones collapse to a line each — a doctor wants
 * "what has changed since last month", not twelve identical lists. Within a
 * round only the answers that were not "none" are shown by default, because a
 * clean round says everything it needs to say in one line.
 */

import { useState } from "react";
import { ChevronDown, ClipboardList, ShieldAlert } from "lucide-react";
import { SEVERITY_LABEL, SEVERITY_TONE, type SymptomSeverity } from "@/lib/screening";

export type ScreeningRound = {
  id: string;
  source: string;
  severity: SymptomSeverity;
  due_on: string;
  seen_at: string | null;
  created_at: string;
  answers: {
    key: string;
    prompt: string;
    tracks: string;
    group: string;
    answer: string;
    severity: SymptomSeverity;
  }[];
};

const RANK: Record<SymptomSeverity, number> = { urgent: 3, concerning: 2, mild: 1, none: 0 };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function ScreeningHistory({ rounds }: { rounds: ScreeningRound[] }) {
  const [openId, setOpenId] = useState<string | null>(rounds[0]?.id ?? null);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  if (rounds.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Symptom checks</h3>
        <p className="mt-2 text-sm text-slate-500">
          Nothing answered yet. The member is asked monthly, and sooner whenever something is flagged.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Symptom checks</h3>
        <span className="text-[11px] text-slate-400">
          {rounds.length} round{rounds.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {rounds.map((round) => {
          const tone = SEVERITY_TONE[round.severity];
          const isOpen = openId === round.id;
          const flagged = round.answers
            .filter((a) => a.severity !== "none")
            .sort((a, b) => RANK[b.severity] - RANK[a.severity]);
          const shown = showAll[round.id] ? round.answers : flagged;

          return (
            <div key={round.id} className={`overflow-hidden rounded-xl border ${tone.border} ${tone.bg}`}>
              <button
                onClick={() => setOpenId(isOpen ? null : round.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-700">
                    {formatDate(round.created_at)}
                    {round.source === "onboarding" && (
                      <span className="ml-1.5 font-normal text-slate-400">· at sign-up</span>
                    )}
                  </span>
                  <span className={`block text-[11px] font-semibold ${tone.text}`}>
                    {SEVERITY_LABEL[round.severity]}
                    {flagged.length > 0 && ` · ${flagged.length} flagged`}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-white/60 bg-white/70 px-3 py-2.5">
                  {round.severity === "urgent" && (
                    <div className="mb-2.5 flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-2">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                      <p className="text-[11px] font-semibold leading-relaxed text-red-700">
                        The member was told to seek care today. Worth a message either way.
                      </p>
                    </div>
                  )}

                  {shown.length === 0 ? (
                    <p className="text-xs text-slate-500">Nothing reported on any question.</p>
                  ) : (
                    <ul className="space-y-2">
                      {shown.map((a) => {
                        const t = SEVERITY_TONE[a.severity];
                        return (
                          <li key={a.key} className="flex items-start gap-2.5">
                            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700">{a.answer}</p>
                              <p className="text-[11px] text-slate-400">
                                {a.tracks} · {a.prompt}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {round.answers.length > flagged.length && (
                    <button
                      onClick={() => setShowAll((s) => ({ ...s, [round.id]: !s[round.id] }))}
                      className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-medical-600 transition hover:text-medical-700"
                    >
                      <ClipboardList className="h-3 w-3" />
                      {showAll[round.id]
                        ? "Show only what was flagged"
                        : `Show all ${round.answers.length} answers`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
