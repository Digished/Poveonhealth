"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { JOURNEY_STAGES, STAGE_LABELS, stageIndex, JourneyStage } from "@/lib/lims";

export interface JourneyEvent {
  id: string;
  stage: string;
  note?: string | null;
  actor_email?: string | null;
  created_at: string;
}

function fmtElapsed(fromIso: string, toIso?: string): string {
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  const mins = Math.max(0, Math.round((to - from) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = mins / 60;
  if (hrs < 48) return `${Math.round(hrs * 10) / 10}h`;
  return `${Math.round(hrs / 24)}d`;
}

/**
 * Horizontal 6-stage journey stepper. Completed stages are filled, the current
 * stage pulses, future stages are muted. Shows the timestamp reached per stage.
 */
export function JourneyMap({
  currentStage,
  events,
  compact = false,
}: {
  currentStage: string | null;
  events: JourneyEvent[];
  compact?: boolean;
}) {
  const reached = new Map<string, string>(); // stage -> first reached timestamp
  for (const e of events) if (!reached.has(e.stage)) reached.set(e.stage, e.created_at);

  const currentIdx = currentStage ? stageIndex(currentStage) : -1;

  return (
    <div className={clsx("flex items-center", compact ? "gap-0" : "gap-0 sm:gap-1")}>
      {JOURNEY_STAGES.map((stage: JourneyStage, i) => {
        const done = currentIdx > i;
        const active = currentIdx === i;
        const ts = reached.get(stage);
        return (
          <div key={stage} className="flex items-center flex-1 min-w-0 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  "flex items-center justify-center rounded-full border transition-colors",
                  compact ? "h-5 w-5" : "h-8 w-8",
                  done && "bg-emerald-500 border-emerald-500 text-white",
                  active && "bg-medical-500 border-medical-400 text-white animate-pulse",
                  !done && !active && "bg-white/5 border-white/15 text-slate-500",
                )}
                title={STAGE_LABELS[stage]}
              >
                {done ? <Check className={compact ? "h-3 w-3" : "h-4 w-4"} /> : <span className={compact ? "text-[9px]" : "text-xs font-semibold"}>{i + 1}</span>}
              </div>
              {!compact && (
                <div className="mt-1.5 text-center">
                  <p className={clsx("text-[11px] font-medium leading-tight", done || active ? "text-slate-200" : "text-slate-500")}>
                    {STAGE_LABELS[stage]}
                  </p>
                  {ts && <p className="text-[10px] text-slate-500">{new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>}
                </div>
              )}
            </div>
            {i < JOURNEY_STAGES.length - 1 && (
              <div className="flex-1 px-1">
                <div className={clsx("h-0.5 w-full rounded", currentIdx > i ? "bg-emerald-500/70" : "bg-white/10")} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Vertical detailed timeline of journey events with elapsed time between steps. */
export function JourneyTimeline({ events }: { events: JourneyEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-slate-400">No journey events yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-white/10 pl-5">
      {events.map((e, i) => {
        const next = events[i + 1];
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full bg-medical-400 ring-4 ring-medical-500/20" />
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-white">{STAGE_LABELS[e.stage as JourneyStage] ?? e.stage}</p>
              <p className="text-xs text-slate-400">{new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            {e.note && <p className="text-xs text-slate-400">{e.note}</p>}
            {e.actor_email && <p className="text-[11px] text-slate-500">by {e.actor_email}</p>}
            {next && <p className="mt-1 text-[11px] text-slate-500">↳ {fmtElapsed(e.created_at, next.created_at)} to next stage</p>}
          </li>
        );
      })}
    </ol>
  );
}
