"use client";

import { useState } from "react";
import { X, Info } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { SkyScene, type SceneInfo } from "@/components/SkyScene";

const GREETING: Record<SceneInfo["tod"], string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Good evening",
};

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4 animate-backdrop-in"
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

export function HeroSection({ mode = "professional" }: { mode?: "professional" | "patient" }) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <SkyScene>
        {({ tod }) => (
          <div className="flex flex-col items-center text-center gap-4 max-w-md mx-auto pt-9 px-4">
            {/* White panel keeps the greeting legible on any time-of-day sky */}
            <div className="rounded-3xl bg-white/85 backdrop-blur-md shadow-xl ring-1 ring-black/5 px-6 py-5">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
                {GREETING[tod]}
              </h1>
              <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600 max-w-xs">
                {mode === "patient"
                  ? "What test do you need today?"
                  : "What test does your patient need today?"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-medical-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-medical-600/30 transition-colors hover:bg-medical-700"
            >
              <Info className="w-4 h-4" /> Learn more
            </button>
          </div>
        )}
      </SkyScene>

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  );
}
