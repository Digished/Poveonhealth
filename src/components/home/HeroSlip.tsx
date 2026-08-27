"use client";

import { Check, FlaskConical, Mail } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

const LINES = [
  { label: "Patient", value: "w-[62%]" },
  { label: "Age / Sex", value: "w-[38%]" },
  { label: "Tests", value: "w-[78%]" },
  { label: "Tests", value: "w-[54%]" },
  { label: "Diagnosis", value: "w-[66%]" },
  { label: "Referred by", value: "w-[48%]" },
];

/**
 * Decorative hero visual: a request slip filling itself in, then being
 * acknowledged by the lab. Pure CSS animation on a loop — no timers, and it
 * stands still for anyone with reduced motion.
 */
export function HeroSlip() {
  return (
    <div className="relative mx-auto w-full max-w-[380px] select-none" aria-hidden="true">
      {/* Stacked sheets behind, for depth */}
      <div className="absolute inset-x-4 top-4 h-full rounded-2xl bg-white/60 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)]" />
      <div className="absolute inset-x-2 top-2 h-full rounded-2xl bg-white/80 shadow-[0_18px_40px_-26px_rgba(15,23,42,0.45)]" />

      {/* The slip */}
      <div className="paper-sheet relative overflow-hidden rounded-2xl border border-stone-200/80 shadow-[0_30px_60px_-28px_rgba(15,23,42,0.55)]">
        <div className="flex items-center gap-2.5 border-b border-stone-300/60 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-medical-600 text-white">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="paper-heading text-[13px] font-bold leading-tight text-slate-800">Partner Laboratory</p>
            <p className="paper-mono text-[9px] uppercase text-stone-400">Laboratory request form</p>
          </div>
          <span className="paper-mono rounded border border-stone-300/70 px-1.5 py-0.5 text-[9px] text-stone-500">
            LR-4F21
          </span>
        </div>

        <div className="space-y-3 px-4 py-4">
          {LINES.map((l, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-[68px] shrink-0 text-[9px] font-bold uppercase tracking-[0.08em] text-stone-400">
                {l.label}
              </span>
              <span className="relative h-[9px] flex-1 rounded-full bg-stone-200/50">
                <span
                  className={`animate-slip-write absolute inset-y-0 left-0 ${l.value} rounded-full bg-gradient-to-r from-slate-400/70 to-slate-300/50`}
                  style={{ animationDelay: `${i * 260}ms` }}
                />
              </span>
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-dashed border-stone-300/80 pt-3">
            <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-stone-400">Signed</span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-500">
              <PoveonLogo className="h-3 w-3 opacity-60" /> via Poveon
            </span>
          </div>
        </div>

        {/* Received stamp */}
        <div
          className="animate-chip-pop absolute bottom-16 right-4 rotate-[-9deg] rounded-md border-2 border-emerald-600/70 bg-[#fdfbf5]/70 px-2.5 py-1"
          style={{ animationDelay: "1.9s" }}
        >
          <p className="paper-mono text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
            Received by lab
          </p>
        </div>
      </div>

      {/* Floating acknowledgements — they hang off the sheet on wide screens
          and sit over the ruled values (never the labels) on small ones. */}
      <div
        className="animate-chip-pop absolute left-14 top-[34%] flex max-w-[210px] items-center gap-2 rounded-2xl border border-white/80 bg-white/95 px-3 py-2 shadow-[0_14px_30px_-14px_rgba(15,23,42,0.45)] backdrop-blur sm:left-auto sm:-left-10"
        style={{ animationDelay: "2.2s" }}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        <span>
          <span className="block text-[11px] font-bold leading-tight text-slate-800">Lab notified</span>
          <span className="block text-[10px] text-slate-400">Request code issued</span>
        </span>
      </div>

      <div
        className="animate-chip-pop absolute right-6 bottom-[6%] flex max-w-[230px] items-center gap-2 rounded-2xl border border-white/80 bg-white/95 px-3 py-2 shadow-[0_14px_30px_-14px_rgba(15,23,42,0.45)] backdrop-blur sm:right-auto sm:-right-10"
        style={{ animationDelay: "3.1s" }}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-medical-50 text-medical-600">
          <Mail className="h-3.5 w-3.5" />
        </span>
        <span>
          <span className="block text-[11px] font-bold leading-tight text-slate-800">Patient notified</span>
          <span className="block text-[10px] text-slate-400">Code by email, SMS &amp; WhatsApp</span>
        </span>
      </div>

    </div>
  );
}
