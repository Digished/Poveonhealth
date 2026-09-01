"use client";

/**
 * The hero visual for the care plan: the card a member actually carries.
 *
 * The whole product is "show this code at the counter", so the visual is the
 * code, with the two things it buys drifting beside it. Everything moves on
 * transform and opacity only — it composites on the GPU and costs nothing on a
 * mid-range Android — and everything stops under prefers-reduced-motion.
 *
 * Decorative: `aria-hidden`, and the real figures are stated in the copy beside
 * it rather than only here.
 */

import { FlaskConical, MessageSquareText, Pill } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

export function CareCard({
  labDiscount = 15,
  pharmacyDiscount = 10,
  messages = 40,
}: {
  labDiscount?: number;
  pharmacyDiscount?: number;
  messages?: number;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[380px] select-none px-2 sm:px-0" aria-hidden="true">
      {/* Light behind the card. */}
      <div
        className="animate-care-glow absolute left-1/2 top-1/2 -z-10 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(37,120,235,0.35), transparent 68%)" }}
      />

      <div className="animate-care-float relative">
        {/* Stacked cards behind, for depth. */}
        <div className="absolute inset-x-3 top-3 h-full rounded-[26px] bg-medical-900/15 blur-[1px]" />
        <div className="absolute inset-x-1.5 top-1.5 h-full rounded-[26px] bg-medical-800/25" />

        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-medical-600 via-medical-700 to-medical-900 p-6 text-white shadow-[0_40px_80px_-32px_rgba(2,88,175,0.85)]">
          {/* Sheen travelling across the face. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
            <div className="animate-care-sheen absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          </div>

          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">
                Poveon Care Plan
              </p>
              <p className="mt-1.5 text-[15px] font-bold">Hypertension &amp; diabetes</p>
            </div>
            <PoveonLogo className="h-6 w-6 opacity-50" />
          </div>

          <p className="relative mt-7 font-mono text-[26px] font-extrabold tracking-[0.16em] sm:text-[30px]">
            PVC-8X4K29
          </p>

          <div className="relative mt-5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-care-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[11px] font-semibold text-white/75">Active for 12 months</span>
            </div>
            <span className="rounded-lg bg-white/15 px-2 py-1 text-[10px] font-bold tracking-wide">
              MEMBER
            </span>
          </div>
        </div>
      </div>

      {/*
        What the code is for.

        These began as chips floating around the card, which looked good in the
        abstract and was wrong in practice: a chip is ~200px and the card is
        380px, so there is nowhere beside it they can sit without covering the
        code — the one thing the visual exists to show. They sit under it
        instead, staggered horizontally so the group still reads as scattered
        rather than as a list, and each still arrives on its own beat.
      */}
      <div className="mt-5 flex flex-col gap-2.5">
        <Chip
          offset="sm:ml-2 sm:mr-auto"
          delay="0.6s"
          icon={<FlaskConical className="h-3.5 w-3.5 text-medical-600" />}
          title={`Up to ${labDiscount}% off tests`}
          note="at any partner lab"
        />
        <Chip
          offset="sm:ml-auto sm:mr-2"
          delay="1.5s"
          icon={<Pill className="h-3.5 w-3.5 text-emerald-600" />}
          title={`Up to ${pharmacyDiscount}% off medicine`}
          note="at partner pharmacies"
        />
        <Chip
          offset="sm:mx-auto"
          delay="2.4s"
          icon={<MessageSquareText className="h-3.5 w-3.5 text-violet-600" />}
          title={`${messages} doctor messages`}
          note="no appointment needed"
        />
      </div>
    </div>
  );
}

function Chip({
  offset,
  delay,
  icon,
  title,
  note,
}: {
  /** Horizontal stagger from `sm` up; full width on a phone. */
  offset: string;
  delay: string;
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <div
      className={`animate-care-chip relative z-10 flex items-center gap-2.5 rounded-2xl border border-white/80 bg-white/95 px-3.5 py-2.5 shadow-[0_16px_34px_-16px_rgba(15,23,42,0.5)] backdrop-blur sm:w-fit ${offset}`}
      style={{ animationDelay: delay }}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-bold leading-tight text-slate-800 sm:whitespace-nowrap">
          {title}
        </span>
        <span className="block text-[10.5px] leading-tight text-slate-500 sm:whitespace-nowrap">
          {note}
        </span>
      </span>
    </div>
  );
}
