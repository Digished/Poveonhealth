"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, MessageCircle, Phone as PhoneIcon } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { parsePhones } from "@/lib/phones";

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

function parseWa(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    const arr: string[] = Array.isArray(p) ? p : [raw];
    return arr.filter((n) => n.replace(/\D/g, "").length >= 7);
  } catch {
    return raw.replace(/\D/g, "").length >= 7 ? [raw] : [];
  }
}

// ── Sky decorations ───────────────────────────────────────────────────────────

function SunIcon() {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true" style={{ willChange: "contents" }}>
      {rays.map((angle, i) => (
        <line
          key={angle}
          x1="26" y1="4" x2="26" y2="10"
          stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round"
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
        <path d="M22 58 Q20 42 38 40 Q36 22 56 20 Q66 9 86 20 Q110 13 124 30 Q142 23 162 36 Q180 29 194 42 Q210 42 216 58 Z" fill="white" />
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
    { cx: 8,  cy: 12, r: 1.2, d: 0   }, { cx: 22, cy: 5,  r: 0.8, d: 0.5 },
    { cx: 38, cy: 18, r: 1.4, d: 1   }, { cx: 55, cy: 8,  r: 0.9, d: 0.2 },
    { cx: 70, cy: 22, r: 1.1, d: 1.5 }, { cx: 85, cy: 6,  r: 0.7, d: 0.8 },
    { cx: 15, cy: 32, r: 1.3, d: 2   }, { cx: 45, cy: 38, r: 0.8, d: 0.3 },
    { cx: 62, cy: 42, r: 1.0, d: 1.2 }, { cx: 80, cy: 30, r: 1.2, d: 0.7 },
    { cx: 93, cy: 16, r: 0.9, d: 1.8 }, { cx: 30, cy: 52, r: 0.7, d: 2.5 },
    { cx: 75, cy: 55, r: 1.1, d: 0.4 }, { cx: 5,  cy: 58, r: 0.8, d: 1.6 },
    { cx: 50, cy: 60, r: 1.3, d: 0.9 }, { cx: 90, cy: 60, r: 0.6, d: 2.2 },
    { cx: 18, cy: 70, r: 1.0, d: 1.3 }, { cx: 65, cy: 72, r: 0.7, d: 0.6 },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <svg className="w-full h-full" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="white"
            style={{ animation: `twinkle 2.5s ease-in-out ${s.d}s infinite alternate` }}
          />
        ))}
      </svg>
    </div>
  );
}

// ── Lab info modal ────────────────────────────────────────────────────────────

function LabInfoModal({
  labName, logoUrl, labAddress, labServiceCategories, phones, waNumbers, onClose,
}: {
  labName: string;
  logoUrl?: string | null;
  labAddress?: string | null;
  labServiceCategories?: string[];
  phones: { number: string }[];
  waNumbers: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[80dvh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden" aria-hidden="true">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-4 flex items-center gap-3 border-b border-slate-100">
          {logoUrl ? (
            <img src={logoUrl} alt={labName} className="w-12 h-12 rounded-2xl object-contain shadow-sm shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-medical-100 flex items-center justify-center shrink-0">
              <PoveonLogo className="w-6 h-6 text-medical-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-slate-900 leading-tight truncate">{labName}</h2>
            {labAddress && (
              <p className="text-xs text-slate-500 flex items-start gap-1 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{labAddress}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Service categories */}
        {labServiceCategories && labServiceCategories.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Services</p>
            <div className="flex flex-wrap gap-1.5">
              {labServiceCategories.map((s) => (
                <span key={s} className="text-xs bg-medical-50 text-medical-700 border border-medical-100 px-2.5 py-1 rounded-full font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Contact */}
        {(waNumbers.length > 0 || phones.length > 0) && (
          <div className="px-5 py-4 border-b border-slate-100 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Contact</p>
            {waNumbers.map((wa) => (
              <a
                key={wa}
                href={`https://wa.me/${wa.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                WhatsApp {wa}
              </a>
            ))}
            {phones.map((p) => (
              <a
                key={p.number}
                href={`tel:${p.number}`}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-medical-50 text-medical-700 text-sm font-semibold hover:bg-medical-100 transition-colors"
              >
                <PhoneIcon className="w-4 h-4 shrink-0" />
                {p.number}
              </a>
            ))}
          </div>
        )}

        {/* Powered by */}
        <div className="px-5 py-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Lab requests on this page are powered by{" "}
            <span className="font-semibold text-slate-500">Poveon</span> — encrypted, instant delivery to the lab.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface LabHeroSectionProps {
  labName: string;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  labAddress?: string | null;
  labServiceCategories?: string[];
  labPhones?: unknown;
  labWhatsapp?: string | null;
  mode?: "professional" | "patient";
}

export function LabHeroSection({
  labName, logoUrl, heroImageUrl,
  labAddress, labServiceCategories, labPhones, labWhatsapp,
}: LabHeroSectionProps) {
  const [tod, setTod] = useState<TimeOfDay>("morning");
  const [mounted, setMounted] = useState(false);
  const [compact, setCompact] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    setTod(getTimeOfDay(new Date().getHours()));
    setMounted(true);
  }, []);

  // Collapse hero to slim bar when user scrolls past ~100 px in main
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    function onScroll() {
      const top = main!.scrollTop;
      setCompact((prev) => {
        if (prev && top < 60) return false;
        if (!prev && top > 100) return true;
        return prev;
      });
    }
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  const isDay = tod === "morning" || tod === "afternoon";
  const phones = parsePhones(labPhones);
  const waNumbers = parseWa(labWhatsapp);
  const hasContact = waNumbers.length > 0 || phones.length > 0;
  const waHref = waNumbers.length > 0 ? `https://wa.me/${waNumbers[0].replace(/\D/g, "")}` : null;
  const telHref = phones.length > 0 ? `tel:${phones[0].number}` : null;

  return (
    <>
      <div
        id="lab-hero"
        className={`sticky top-0 z-50 overflow-hidden transition-colors duration-300 ${
          compact
            ? "bg-white/95 backdrop-blur-md border-b border-slate-200/60 shadow-sm"
            : isDay
              ? "bg-gradient-to-b from-sky-200/70 via-sky-100/50 to-transparent"
              : "bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-800"
        }`}
      >
        {/* Hero image bg — expanded only */}
        {!compact && heroImageUrl && (
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <img src={heroImageUrl} alt="" className="w-full h-full object-cover" />
            <div className={`absolute inset-0 ${isDay ? "bg-sky-200/55" : "bg-indigo-950/75"}`} />
          </div>
        )}

        {/* Animated sky — expanded only */}
        {!compact && (isDay ? <CloudLayer /> : <StarField />)}

        {/* ── Compact bar ────────────────────────────────────────── */}
        <div
          className={`flex items-center h-16 px-4 gap-3 transition-[opacity,transform] duration-200 ${
            compact
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-1 absolute inset-0 pointer-events-none"
          }`}
        >
          {/* Logo */}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={labName}
              className="w-9 h-9 rounded-xl object-contain shadow-sm shrink-0"
              style={{ width: 36, height: 36 }}
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
              <PoveonLogo className="w-5 h-5 text-medical-600" />
            </div>
          )}

          {/* Name */}
          <p className="text-sm font-bold text-slate-800 flex-1 truncate">{labName}</p>

          {/* Contact button */}
          {hasContact && (
            waHref ? (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-sm transition-colors shrink-0"
                title={`WhatsApp ${labName}`}
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            ) : (
              <a
                href={telHref!}
                className="w-9 h-9 rounded-xl bg-medical-600 hover:bg-medical-700 text-white flex items-center justify-center shadow-sm transition-colors shrink-0"
                title={`Call ${labName}`}
              >
                <PhoneIcon className="w-4 h-4" />
              </a>
            )
          )}
        </div>

        {/* ── Full hero content ───────────────────────────────────── */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            compact ? "max-h-0" : "max-h-[500px]"
          }`}
        >
          <div
            className={`relative z-10 flex flex-col items-center text-center gap-3 max-w-sm mx-auto px-4 pt-6 pb-8 transition-[opacity,transform] duration-500 ${
              mounted && !compact ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            {/* Sun / Moon */}
            <div>{isDay ? <SunIcon /> : <MoonIcon />}</div>

            {/* Lab logo */}
            <div
              className="bg-white rounded-[22px] shadow-2xl ring-4 ring-white/50 overflow-hidden flex items-center justify-center"
              style={{ animation: "lab-hero-float 5s ease-in-out infinite", width: 88, height: 88 }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={labName}
                  width={80}
                  height={80}
                  className="rounded-[18px] object-contain"
                  style={{ width: 80, height: 80 }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-medical-500 to-sky-400 flex items-center justify-center">
                  <PoveonLogo className="w-10 h-10 text-white" />
                </div>
              )}
            </div>

            {/* Text */}
            <div className="space-y-1">
              <p className={`text-[10px] font-bold uppercase tracking-[0.24em] ${isDay ? "text-slate-500" : "text-sky-300/80"}`}>
                Welcome to
              </p>
              <h1 className={`text-3xl font-black tracking-tight leading-[1.05] ${isDay ? "text-slate-900" : "text-white"}`}>
                {labName}
              </h1>
              <p className={`text-sm font-semibold ${isDay ? "text-slate-600" : "text-sky-100/90"}`}>
                {GREETING[tod]}
              </p>
            </div>

            {/* Learn more */}
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className={`text-xs font-semibold underline underline-offset-2 transition-colors ${
                isDay ? "text-medical-600 hover:text-medical-800" : "text-sky-300 hover:text-sky-100"
              }`}
            >
              Learn more
            </button>
          </div>
        </div>
      </div>

      {/* Lab details modal */}
      {detailsOpen && mounted && createPortal(
        <LabInfoModal
          labName={labName}
          logoUrl={logoUrl}
          labAddress={labAddress}
          labServiceCategories={labServiceCategories}
          phones={phones}
          waNumbers={waNumbers}
          onClose={() => setDetailsOpen(false)}
        />,
        document.body
      )}
    </>
  );
}
