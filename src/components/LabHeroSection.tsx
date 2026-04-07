"use client";

import { useEffect, useState } from "react";
import { FlaskConical, ChevronDown } from "lucide-react";
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
  heroImageUrl?: string | null;
  mode?: "professional" | "patient";
}

export function LabHeroSection({ labName, logoUrl, heroImageUrl, mode = "professional" }: LabHeroSectionProps) {
  const [tod, setTod] = useState<TimeOfDay>("morning");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTod(getTimeOfDay(new Date().getHours()));
    setMounted(true);
  }, []);

  function scrollToForm() {
    const target = document.getElementById("form-toggle") as HTMLElement | null;
    const main = document.querySelector("main");
    if (!target || !main) return;
    const mainRect = main.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    main.scrollTo({ top: main.scrollTop + (targetRect.top - mainRect.top), behavior: "smooth" });
  }

  // ── Hero image variant ────────────────────────────────────────────────────────
  if (heroImageUrl) {
    return (
      <div id="lab-hero" className="relative h-dvh overflow-hidden flex flex-col md:flex-row">

        {/* Image — absolute bg on mobile, left half on desktop */}
        <div className="absolute inset-0 md:static md:inset-auto md:w-1/2 md:flex-shrink-0 md:relative">
          <img
            src={heroImageUrl}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover pointer-events-none"
          />
          {/* Mobile: bottom-to-top white gradient */}
          <div
            className="md:hidden absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{ background: "linear-gradient(to top, rgba(255,255,255,1) 28%, rgba(255,255,255,0) 72%)" }}
          />
          {/* Desktop: right-edge fade into white panel */}
          <div
            className="hidden md:block absolute inset-y-0 right-0 w-24 pointer-events-none"
            aria-hidden="true"
            style={{ background: "linear-gradient(to right, transparent, white)" }}
          />
        </div>

        {/* Content — bottom overlay on mobile, right half on desktop */}
        <div
          className={`relative z-10 flex flex-col flex-1 justify-end md:justify-center md:bg-white transition-[opacity,transform] duration-700 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          {/* ── Mobile layout ── */}
          <div className="md:hidden px-5 pb-[20vh]">
            <div className="relative bg-white/95 backdrop-blur-sm rounded-3xl shadow-xl px-5 pt-14 pb-6">
              {/* Logo: small, pinned to top-left corner of the card, floating */}
              {logoUrl && (
                <div
                  className="absolute -top-9 left-5 bg-white rounded-[18px] p-1.5 shadow-xl"
                  style={{ animation: "lab-hero-float 5s ease-in-out infinite" }}
                >
                  <img
                    src={logoUrl}
                    alt={labName}
                    width={62}
                    height={62}
                    className="rounded-[12px] object-contain"
                    style={{ width: 62, height: 62 }}
                  />
                </div>
              )}
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.24em]">
                Welcome to
              </p>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-[1.05] mt-1">
                {labName}
              </h1>
              <p className="text-base font-bold text-slate-700 mt-1.5">{GREETING[tod]}</p>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">Book a lab test today.</p>
            </div>
            <button
              type="button"
              onClick={scrollToForm}
              className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-700 active:scale-95 text-white text-sm font-bold rounded-2xl shadow-lg transition-all"
            >
              <FlaskConical className="w-4 h-4" />
              Create a Lab Request
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* ── Desktop layout ── */}
          <div className="hidden md:flex flex-col gap-6 px-12 max-w-lg">
            {logoUrl && (
              <div
                className="bg-white rounded-[28px] p-2.5 shadow-xl self-start border border-slate-100"
                style={{ animation: "lab-hero-float 5s ease-in-out infinite" }}
              >
                <img
                  src={logoUrl}
                  alt={labName}
                  width={100}
                  height={100}
                  className="rounded-[22px] object-contain"
                  style={{ width: 100, height: 100 }}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.24em]">
                Welcome to
              </p>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-[1.05]">
                {labName}
              </h1>
              <p className="text-base font-semibold text-slate-600">{GREETING[tod]}</p>
              <p className="text-sm text-slate-500">Book a lab test today.</p>
            </div>
            <button
              type="button"
              onClick={scrollToForm}
              className="self-start inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-700 active:scale-95 text-white text-sm font-bold rounded-2xl shadow-lg transition-all"
            >
              <FlaskConical className="w-4 h-4" />
              Create a Lab Request
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Default variant (logo blur / gradient background) ─────────────────────
  return (
    <div id="lab-hero" className="relative overflow-hidden min-h-dvh flex flex-col justify-center pt-10 pb-8 px-4">

      {/* Background layer: blurred logo palette wash */}
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

      {/* White veil */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 35%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.50) 50%, rgba(255,255,255,0.96) 88%, #ffffff 100%)",
        }}
      />

      {/* Dot-grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          opacity: 0.04,
        }}
      />

      {/* Content */}
      <div
        className={`relative z-10 flex flex-col items-center text-center gap-5 max-w-xs sm:max-w-sm mx-auto transition-[opacity,transform] duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
        }`}
      >
        {/* Logo */}
        <div className="relative flex items-center justify-center" style={{ animation: "lab-hero-float 5s ease-in-out infinite" }}>
          <div className="absolute rounded-[36px] bg-sky-100/80 pointer-events-none" aria-hidden="true" style={{ width: 128, height: 128 }} />
          <div className="absolute rounded-[34px] bg-white/50 backdrop-blur-sm pointer-events-none" aria-hidden="true" style={{ width: 122, height: 122 }} />
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={labName}
              width={110}
              height={110}
              className="relative rounded-[28px] object-contain shadow-2xl ring-[3px] ring-white/90"
              style={{ width: 110, height: 110 }}
            />
          ) : (
            <div className="relative rounded-[28px] bg-gradient-to-br from-medical-500 to-sky-400 shadow-2xl flex items-center justify-center ring-[3px] ring-white/80" style={{ width: 110, height: 110 }}>
              <PoveonLogo className="w-14 h-14 text-white" />
            </div>
          )}
        </div>

        {/* Text block */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.24em]">
            Welcome to
          </p>
          <h1 className="text-[26px] sm:text-3xl font-black text-slate-900 tracking-tight leading-[1.1]">
            {labName}
          </h1>
          <p className="text-sm font-semibold text-slate-600">
            {GREETING[tod]}
          </p>
          <p className="text-[13px] text-slate-500 leading-relaxed">
            {mode === "patient"
              ? "What test do you need today?"
              : "What test does your patient need today?"}
          </p>
        </div>

        {/* CTA button */}
        <button
          type="button"
          onClick={scrollToForm}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-700 active:scale-95 text-white text-sm font-bold rounded-2xl shadow-lg transition-all"
        >
          <FlaskConical className="w-4 h-4" />
          Create a Lab Request
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
