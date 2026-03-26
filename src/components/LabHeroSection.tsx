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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTod(getTimeOfDay(new Date().getHours()));
    setMounted(true);
  }, []);

  return (
    <div id="lab-hero" className="relative overflow-hidden pt-12 pb-24 px-4">

      {/* ── Background layer: blurred logo palette wash ── */}
      {logoUrl ? (
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${logoUrl})`,
            backgroundSize: "300% 300%",
            backgroundPosition: "center",
            filter: "blur(60px) saturate(3.5) brightness(1.15)",
            opacity: 0.32,
            transform: "scale(1.5)",
          }}
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute -top-8 left-1/3 w-80 h-80 bg-sky-300/40 rounded-full blur-3xl" />
          <div className="absolute top-4 -right-12 w-64 h-64 bg-indigo-300/35 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-8 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl" />
        </div>
      )}

      {/* ── White veil: radial from centre → transparent edges ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 35%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.50) 50%, rgba(255,255,255,0.96) 88%, #ffffff 100%)",
        }}
      />

      {/* ── Subtle dot-grid texture (1% opacity) ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          opacity: 0.04,
        }}
      />

      {/* ── Content ── */}
      <div
        className={`relative z-10 flex flex-col items-center text-center gap-6 max-w-xs mx-auto transition-[opacity,transform] duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        {/* Logo — with ambient glow + float animation */}
        <div className="relative flex items-center justify-center" style={{ animation: "lab-hero-float 5s ease-in-out infinite" }}>
          <div className="absolute w-28 h-28 rounded-[30px] bg-sky-100/80 pointer-events-none" aria-hidden="true" />

          {/* Frosted halo */}
          <div className="absolute w-[108px] h-[108px] rounded-[30px] bg-white/50 backdrop-blur-sm pointer-events-none" aria-hidden="true" />

          {/* Logo image or fallback */}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={labName}
              width={92}
              height={92}
              className="relative rounded-[24px] object-contain shadow-2xl ring-[3px] ring-white/90"
              style={{ width: 92, height: 92 }}
            />
          ) : (
            <div className="relative w-[92px] h-[92px] rounded-[24px] bg-gradient-to-br from-medical-500 to-sky-400 shadow-2xl flex items-center justify-center ring-[3px] ring-white/80">
              <PoveonLogo className="w-12 h-12 text-white" />
            </div>
          )}
        </div>

        {/* Text block */}
        <div className="space-y-1.5">
          {/* Time-of-day greeting */}
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.24em]">
            {GREETING[tod]}
          </p>

          {/* Lab name — large, bold, tight */}
          <h1 className="text-[30px] sm:text-4xl font-black text-slate-900 tracking-tight leading-[1.1]">
            {labName}
          </h1>

          {/* Divider accent */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-slate-300" />
            <span className="text-[11px] text-slate-400 font-medium">diagnostic services</span>
            <div className="h-px w-10 bg-gradient-to-l from-transparent to-slate-300" />
          </div>

          <p className="text-[13px] text-slate-500 leading-relaxed pt-0.5">
            What test does your patient need today?
          </p>
        </div>
      </div>
    </div>
  );
}
