"use client";

import { useEffect, useState } from "react";

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
    <div className="relative overflow-hidden pt-10 pb-8 px-4">
      {/* Blurred logo as background — auto-extracts lab colour palette */}
      {logoUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${logoUrl})`,
            backgroundSize: "200% 200%",
            backgroundPosition: "center",
            filter: "blur(72px) saturate(2.2) brightness(1.1)",
            opacity: 0.18,
            transform: "scale(1.25)",
          }}
        />
      )}

      {/* Fallback colour orbs when no logo */}
      {!logoUrl && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-sky-100/70 rounded-full blur-3xl" />
          <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-100/50 rounded-full blur-3xl" />
        </div>
      )}

      {/* Gradient overlay so text stays readable over the blurred logo */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.75) 60%, rgba(255,255,255,0.95) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center gap-3 max-w-md mx-auto">
        {/* Lab logo mark */}
        {logoUrl ? (
          <div className="relative">
            {/* Soft glow ring behind the logo */}
            <div
              className="absolute -inset-2 rounded-3xl opacity-30 blur-lg"
              style={{
                backgroundImage: `url(${logoUrl})`,
                backgroundSize: "cover",
                filter: "blur(12px) saturate(3)",
              }}
              aria-hidden="true"
            />
            <img
              src={logoUrl}
              alt={labName}
              width={72}
              height={72}
              className="relative w-16 h-16 rounded-2xl object-contain shadow-xl ring-4 ring-white/70"
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-medical-500 to-sky-400 shadow-xl flex items-center justify-center ring-4 ring-white/60">
            <svg viewBox="0 0 32 32" fill="none" className="w-9 h-9 text-white">
              <path d="M10 6v7L4 21q-1.5 4 1.5 5H26.5q3-1 1.5-5L22 13V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="8" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        )}

        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            {GREETING[tod]}
          </p>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-snug">
            Welcome to<br />{labName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            What test does your patient need today?
          </p>
        </div>
      </div>
    </div>
  );
}
