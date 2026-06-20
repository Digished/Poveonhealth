"use client";

import { useState } from "react";
import { X } from "lucide-react";
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

export function HeroSection({ mode = "professional" }: { mode?: "professional" | "patient" }) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <SkyScene>
        {({ lightText, tod }) => (
          <div className="flex flex-col items-center text-center gap-2 max-w-md mx-auto pt-9 px-4">
            <h1
              className="text-3xl sm:text-4xl font-bold tracking-tight transition-colors duration-700"
              style={{
                color: lightText ? "#f8fafc" : "#0f172a",
                textShadow: lightText
                  ? "0 1px 14px rgba(0,0,0,0.4)"
                  : "0 1px 12px rgba(255,255,255,0.55)",
              }}
            >
              {GREETING[tod]}
            </h1>
            <p
              className="text-[15px] leading-relaxed max-w-xs transition-colors duration-700"
              style={{
                color: lightText ? "rgba(248,250,252,0.9)" : "#475569",
                textShadow: lightText ? "0 1px 10px rgba(0,0,0,0.35)" : "none",
              }}
            >
              {mode === "patient"
                ? "What test do you need today?"
                : "What test does your patient need today?"}{" "}
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className={`font-semibold underline underline-offset-2 transition-colors ${
                  lightText
                    ? "text-sky-200 hover:text-white"
                    : "text-medical-700 hover:text-medical-900"
                }`}
              >
                Learn more
              </button>
            </p>
          </div>
        )}
      </SkyScene>

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  );
}
