"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, MapPin, MessageCircle, Phone as PhoneIcon, Info } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { parsePhones } from "@/lib/phones";
import { SkyScene, useSceneInfo, type SceneInfo } from "@/components/SkyScene";

const GREETING: Record<SceneInfo["tod"], string> = {
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
        <div className="flex justify-center pt-3 pb-1 sm:hidden" aria-hidden="true">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
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
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {labServiceCategories && labServiceCategories.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Services</p>
            <div className="flex flex-wrap gap-1.5">
              {labServiceCategories.map((s) => (
                <span key={s} className="text-xs bg-medical-50 text-medical-700 border border-medical-100 px-2.5 py-1 rounded-full font-medium">{s}</span>
              ))}
            </div>
          </div>
        )}
        {(waNumbers.length > 0 || phones.length > 0) && (
          <div className="px-5 py-4 border-b border-slate-100 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Contact</p>
            {waNumbers.map((wa) => (
              <a key={wa} href={`https://wa.me/${wa.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition-colors">
                <MessageCircle className="w-4 h-4 shrink-0" />WhatsApp {wa}
              </a>
            ))}
            {phones.map((p) => (
              <a key={p.number} href={`tel:${p.number}`}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-medical-50 text-medical-700 text-sm font-semibold hover:bg-medical-100 transition-colors">
                <PhoneIcon className="w-4 h-4 shrink-0" />{p.number}
              </a>
            ))}
          </div>
        )}
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
  const { tod } = useSceneInfo();
  const [mounted, setMounted] = useState(false);
  // true while the hero is visible in the viewport; false once fully scrolled out
  const [heroVisible, setHeroVisible] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // IntersectionObserver: show mini-header when hero is fully out of the viewport
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { root: null, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const phones = parsePhones(labPhones);
  const waNumbers = parseWa(labWhatsapp);
  const hasContact = waNumbers.length > 0 || phones.length > 0;
  const waHref = waNumbers.length > 0 ? `https://wa.me/${waNumbers[0].replace(/\D/g, "")}` : null;
  const telHref = phones.length > 0 ? `tel:${phones[0].number}` : null;

  return (
    <>
      {/* ── Hero section (normal flow, scrolls away) ────────────────────── */}
      <div
        id="lab-hero"
        ref={heroRef}
        className="relative overflow-hidden pt-8 pb-9 px-4"
      >
        {/* Background — a custom hero image if the lab has one, otherwise the
            dynamic time-of-day landscape. */}
        {heroImageUrl ? (
          <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
            <img src={heroImageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-white/45" />
          </div>
        ) : (
          <div className="absolute inset-0" aria-hidden="true">
            <SkyScene heightClass="h-full" />
          </div>
        )}

        {/* Content */}
        <div
          className={`relative z-20 flex flex-col items-center text-center gap-3 max-w-sm mx-auto transition-[opacity,transform] duration-700 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          {/* Lab logo */}
          <div
            className="bg-white rounded-[22px] shadow-2xl ring-4 ring-white/50 overflow-hidden flex items-center justify-center"
            style={{ animation: "lab-hero-float 5s ease-in-out infinite", width: 88, height: 88 }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={labName} width={80} height={80}
                className="rounded-[18px] object-contain" style={{ width: 80, height: 80 }} />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-medical-500 to-sky-400 flex items-center justify-center">
                <PoveonLogo className="w-10 h-10 text-white" />
              </div>
            )}
          </div>

          {/* Text — each line gets its own white pill that hugs its text, so
              shorter lines have shorter panels than the ones below them. */}
          <div className="flex flex-col items-center gap-1.5">
            <p className="w-fit max-w-full rounded-full bg-white/85 backdrop-blur-md shadow-md ring-1 ring-black/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Welcome to
            </p>
            <h1 className="w-fit max-w-full rounded-2xl bg-white/85 backdrop-blur-md shadow-lg ring-1 ring-black/5 px-5 py-2 text-3xl sm:text-4xl font-black tracking-tight leading-[1.05] text-slate-900">
              {labName}
            </h1>
            <p className="w-fit max-w-full rounded-2xl bg-white/85 backdrop-blur-md shadow-lg ring-1 ring-black/5 px-4 py-2 text-sm font-medium text-slate-600">
              {GREETING[tod]} — how may we assist you today?
            </p>
          </div>

          {/* Learn more */}
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-medical-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-medical-600/30 transition-colors hover:bg-medical-700"
          >
            <Info className="w-4 h-4" /> Learn more
          </button>
        </div>
      </div>

      {/* ── Fixed mini-header — slides in when hero scrolls out of view ─── */}
      {mounted && createPortal(
        <div
          className={`fixed top-0 inset-x-0 z-50 h-16 bg-white/90 backdrop-blur-md border-b border-stone-200/60 shadow-sm transition-[opacity,transform] duration-300 ease-out ${
            heroVisible
              ? "opacity-0 -translate-y-2 pointer-events-none"
              : "opacity-100 translate-y-0"
          }`}
        >
          <div className="max-w-2xl mx-auto h-full px-4 flex items-center gap-3">
            {/* Logo */}
            {logoUrl ? (
              <img src={logoUrl} alt={labName} className="w-9 h-9 rounded-xl object-contain shadow-sm shrink-0" style={{ width: 36, height: 36 }} />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
                <PoveonLogo className="w-5 h-5 text-medical-600" />
              </div>
            )}
            {/* Name */}
            <p className="text-sm font-semibold text-stone-800 flex-1 truncate">{labName}</p>
            {/* Contact */}
            {hasContact && (
              waHref ? (
                <a href={waHref} target="_blank" rel="noopener noreferrer"
                  className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-sm transition-colors shrink-0"
                  title={`WhatsApp ${labName}`}>
                  <MessageCircle className="w-4 h-4" />
                </a>
              ) : (
                <a href={telHref!}
                  className="w-9 h-9 rounded-xl bg-medical-600 hover:bg-medical-700 text-white flex items-center justify-center shadow-sm transition-colors shrink-0"
                  title={`Call ${labName}`}>
                  <PhoneIcon className="w-4 h-4" />
                </a>
              )
            )}
          </div>
        </div>,
        document.body
      )}

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
