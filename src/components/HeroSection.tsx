"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
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

function SunIcon() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true" style={{ willChange: "contents" }}>
      {rays.map((angle, i) => (
        <line
          key={angle}
          x1="26" y1="4" x2="26" y2="10"
          stroke="#FBBF24"
          strokeWidth="2.5"
          strokeLinecap="round"
          transform={`rotate(${angle} 26 26)`}
          style={{ animation: `ray-pulse 2s ease-in-out ${i * 0.25}s infinite` }}
        />
      ))}
      <circle cx="26" cy="26" r="11" fill="#FBBF24" />
      <circle cx="26" cy="26" r="8.5" fill="#FDE68A" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" fill="none" aria-hidden="true">
      <path
        d="M32 23C32 30.18 26.18 36 19 36C11.82 36 6 30.18 6 23C6 15.82 11.82 10 19 10C14.2 13.8 13 18.6 15.2 23.4C17.4 28.2 24.5 30.5 32 23Z"
        fill="#BAE6FD"
      />
      <circle cx="32" cy="14" r="1.8" fill="#E0F2FE" opacity="0.7" />
      <circle cx="35" cy="20" r="1.2" fill="#E0F2FE" opacity="0.55" />
      <circle cx="29" cy="10" r="1" fill="#E0F2FE" opacity="0.5" />
    </svg>
  );
}

function Cloud({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="absolute" style={style} aria-hidden="true">
      <svg viewBox="0 0 240 72" fill="none" width="240" height="72">
        <path
          d="M22 58 Q20 42 38 40 Q36 22 56 20 Q66 9 86 20 Q110 13 124 30 Q142 23 162 36 Q180 29 194 42 Q210 42 216 58 Z"
          fill="white"
        />
      </svg>
    </div>
  );
}

function CloudLayer() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <Cloud style={{ top: "12%", animation: "cloud-drift 55s linear -8s infinite", opacity: 0.75 }} />
      <Cloud style={{ top: "45%", animation: "cloud-drift 85s linear -38s infinite", opacity: 0.45, transform: "scale(1.4)" }} />
      <Cloud style={{ top: "3%", animation: "cloud-drift 68s linear -52s infinite", opacity: 0.35, transform: "scale(0.8)" }} />
    </div>
  );
}

function StarField() {
  const STARS = [
    { cx: 8,  cy: 12, r: 1.2, d: 0   },
    { cx: 22, cy: 5,  r: 0.8, d: 0.5 },
    { cx: 38, cy: 18, r: 1.4, d: 1   },
    { cx: 55, cy: 8,  r: 0.9, d: 0.2 },
    { cx: 70, cy: 22, r: 1.1, d: 1.5 },
    { cx: 85, cy: 6,  r: 0.7, d: 0.8 },
    { cx: 15, cy: 32, r: 1.3, d: 2   },
    { cx: 45, cy: 38, r: 0.8, d: 0.3 },
    { cx: 62, cy: 42, r: 1.0, d: 1.2 },
    { cx: 80, cy: 30, r: 1.2, d: 0.7 },
    { cx: 93, cy: 16, r: 0.9, d: 1.8 },
    { cx: 30, cy: 52, r: 0.7, d: 2.5 },
    { cx: 75, cy: 55, r: 1.1, d: 0.4 },
    { cx: 5,  cy: 58, r: 0.8, d: 1.6 },
    { cx: 50, cy: 60, r: 1.3, d: 0.9 },
    { cx: 90, cy: 60, r: 0.6, d: 2.2 },
    { cx: 18, cy: 70, r: 1.0, d: 1.3 },
    { cx: 65, cy: 72, r: 0.7, d: 0.6 },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <svg className="w-full h-full" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill="white"
            style={{ animation: `twinkle 2.5s ease-in-out ${s.d}s infinite alternate` }}
          />
        ))}
      </svg>
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-backdrop-in"
      style={{ backgroundColor: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-medical-50 via-white to-sky-50 px-6 pt-6 pb-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 shadow-md">
            <PoveonLogo className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-800">About Poveon</h3>
            <p className="text-xs text-slate-400 mt-0.5">Secure lab request platform</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/60 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            Poveon lets licensed healthcare professionals send laboratory test requests directly to accredited labs — no account or login required.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Select your destination lab, enter your patient&apos;s details and your professional information, and submit. The lab is notified instantly and you receive email confirmation at every stage.
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            No faxes, no delays — fast, encrypted communication between clinicians and labs.
          </p>
        </div>
      </div>
    </div>
  );
}

export function HeroSection() {
  const [tod, setTod] = useState<TimeOfDay>("morning");
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    setTod(getTimeOfDay(new Date().getHours()));
  }, []);

  const isDay = tod === "morning" || tod === "afternoon";

  return (
    <>
      <div
        className={`relative overflow-hidden py-10 px-4 pb-12 transition-colors duration-700 ${
          isDay
            ? "bg-gradient-to-b from-sky-200/70 via-sky-100/50 to-transparent"
            : "bg-gradient-to-b from-indigo-200/60 via-slate-100/40 to-transparent"
        }`}
      >
        {isDay ? <CloudLayer /> : <StarField />}

        <div className="relative z-10 flex flex-col items-center text-center gap-2.5 max-w-md mx-auto">
          <div className="mb-1">{isDay ? <SunIcon /> : <MoonIcon />}</div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            {GREETING[tod]}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed max-w-xs">
            What test does your patient need today?{" "}
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="text-medical-600 hover:text-medical-800 font-semibold underline underline-offset-2 transition-colors"
            >
              Learn more
            </button>
          </p>

          {/* Subtle scroll CTA */}
          <div className="flex flex-col items-center gap-1 mt-2">
            <p className="text-[11px] text-slate-400 font-medium">No login needed · scroll to fill a request</p>
            <svg
              className="w-4 h-4 text-slate-300 animate-bounce"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>
        </div>
      </div>

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  );
}
