"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Stethoscope, User, ScrollText, ShieldCheck, Clock } from "lucide-react";
import { LabHeroSection } from "@/components/LabHeroSection";
import { LabFormModal, type FormLocation } from "@/components/request/LabFormModal";
import type { PhoneEntry } from "@/lib/phones";

type Mode = "professional" | "patient";

interface LabPageContentProps {
  labId: string;
  labName: string;
  labAddress?: string | null;
  labServiceCategories: string[];
  labPhones: unknown;
  labWhatsapp?: string | null;
  logoUrl?: string | null;
  heroImageUrl?: string | null;
  locations: Array<{
    lab_id: string;
    lab_branch_id: string | null;
    name: string;
    address: string;
    phones: PhoneEntry[];
    whatsapp?: string | null;
    logo_url?: string | null;
    is_main: boolean;
    is_parent: boolean;
  }>;
}

export function LabPageContent({
  labId,
  labName,
  labAddress,
  labServiceCategories,
  labPhones,
  labWhatsapp,
  logoUrl,
  heroImageUrl,
  locations,
}: LabPageContentProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("professional");

  const start = useCallback((next: Mode) => {
    setMode(next);
    setOpen(true);
  }, []);

  // /lab#request (or ?request=1) opens the sheet straight away — used by QR
  // codes and shared links that should land people directly on the form.
  useEffect(() => {
    const wanted =
      window.location.hash === "#request" ||
      new URLSearchParams(window.location.search).get("request") === "1";
    if (wanted) setOpen(true);
  }, []);

  const lab = {
    id: labId,
    name: labName,
    address: labAddress ?? "",
    logo_url: logoUrl ?? null,
    phones: labPhones,
    whatsapp: labWhatsapp ?? null,
    service_categories: labServiceCategories,
  };

  return (
    <>
      {/* Hero — sticky mini-header takes over once it scrolls away */}
      <LabHeroSection
        labName={labName}
        logoUrl={logoUrl}
        heroImageUrl={heroImageUrl}
        labAddress={labAddress}
        labServiceCategories={labServiceCategories}
        labPhones={labPhones}
        labWhatsapp={labWhatsapp}
        mode={mode}
      />

      {/* Request card — opens this lab's own request sheet */}
      <div id="form-toggle" className="mx-auto max-w-2xl px-4 pb-6">
        <div className="animate-fade-in-up overflow-hidden rounded-3xl border border-stone-200/80 bg-white/85 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.55)] backdrop-blur">
          <div className="border-b border-stone-200/70 bg-gradient-to-r from-medical-50/80 via-white to-sky-50/70 px-5 py-4">
            <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-medical-700">
              <ScrollText className="h-3.5 w-3.5" />
              {labName} · request form
            </p>
            <h2 className="mt-1.5 text-[19px] font-black leading-tight tracking-tight text-slate-900">
              Send a test request to this lab
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              The form opens right here on {labName}&apos;s own headed paper. It takes about a minute, and no account is needed.
            </p>
          </div>

          <div className="grid gap-2.5 p-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => start("professional")}
              className="group flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-medical-300 hover:shadow-[0_18px_36px_-24px_rgba(2,112,195,0.7)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-medical-50 text-medical-600 ring-1 ring-medical-100 transition-colors group-hover:bg-medical-600 group-hover:text-white">
                <Stethoscope className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-slate-900">I&apos;m a clinician</span>
                <span className="block text-[11.5px] text-slate-400">Requesting for a patient</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-medical-600" />
            </button>

            <button
              type="button"
              onClick={() => start("patient")}
              className="group flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_18px_36px_-24px_rgba(5,150,105,0.6)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                <User className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-slate-900">I&apos;m the patient</span>
                <span className="block text-[11.5px] text-slate-400">Booking my own tests</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-emerald-600" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-stone-200/70 px-5 py-3 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Sent only to {labName}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-medical-500" /> Delivered the moment you submit
            </span>
          </div>
        </div>
      </div>

      <LabFormModal
        lab={lab}
        open={open}
        onClose={() => setOpen(false)}
        initialMode={mode}
        locations={locations as FormLocation[]}
      />
    </>
  );
}
