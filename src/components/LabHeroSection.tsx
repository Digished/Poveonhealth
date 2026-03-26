"use client";

import { useEffect, useState } from "react";
import { PoveonLogo } from "@/components/PoveonLogo";

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

function getTimeOfDay(h: number): TimeOfDay {
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

const GREETING: Record<TimeOfDay, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Good evening",
};

interface LabHeroSectionProps {
  labName: string;
  logoUrl?: string | null;
}

export function LabHeroSection({ labName, logoUrl }: LabHeroSectionProps) {
  const [tod, setTod] = useState<TimeOfDay>("morning");

  useEffect(() => {
    setTod(getTimeOfDay(new Date().getHours()));
  }, []);

  return (
    <div id="lab-hero" className="relative overflow-hidden pt-14 pb-16 px-4">
      {/* Blurred logo — auto-extracts palette as background wash */}
      {logoUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${logoUrl})`,
            backgroundSize: "250% 250%",
            backgroundPosition: "center",
            filter: "blur(80px) saturate(2.5) brightness(1.05)",
            opacity: 0.22,
            transform: "scale(1.3)",
          }}
        />
      )}
      {!logoUrl && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-sky-100/80 rounded-full blur-3xl" />
          <div className="absolute -top-8 right-0 w-56 h-56 bg-indigo-100/60 rounded-full blur-3xl" />
        </div>
      )}

      {/* White gradient — readability + smooth bleed into form below */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0.65) 55%, rgba(255,255,255,0.97) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center gap-5 max-w-sm mx-auto">

        {/* Logo with decorative concentric rings + glow */}
        {logoUrl ? (
          <div className="relative flex items-center justify-center">
            {/* Outermost ring */}
            <div className="absolute w-36 h-36 rounded-[36px] border border-white/30 pointer-events-none" aria-hidden="true" />
            {/* Middle ring */}
            <div className="absolute w-28 h-28 rounded-[30px] border border-white/50 pointer-events-none" aria-hidden="true" />
            {/* Colour glow behind logo */}
            <div
              className="absolute w-24 h-24 rounded-3xl opacity-35 blur-2xl pointer-events-none"
              style={{ backgroundImage: `url(${logoUrl})`, backgroundSize: "cover" }}
              aria-hidden="true"
            />
            <img
              src={logoUrl}
              alt={labName}
              width={80}
              height={80}
              className="relative w-20 h-20 rounded-[22px] object-contain shadow-2xl ring-4 ring-white/80"
            />
          </div>
        ) : (
          <div className="relative">
            <div className="absolute -inset-4 rounded-[30px] border border-white/30 pointer-events-none" aria-hidden="true" />
            <div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-medical-500 to-sky-400 shadow-2xl flex items-center justify-center ring-4 ring-white/70">
              <PoveonLogo className="w-10 h-10 text-white" />
            </div>
          </div>
        )}

        {/* Text block */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em]">
            {GREETING[tod]}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight leading-tight">
            {labName}
          </h1>
          <p className="text-sm text-slate-500 max-w-[240px] mx-auto leading-relaxed">
            What test does your patient need today?
          </p>
        </div>

      </div>
    </div>
  );
}
