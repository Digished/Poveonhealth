"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Zap, X, ChevronLeft, ChevronRight, Check, User, Phone, Mail, Calendar, Send } from "lucide-react";

// Bump the version to re-show the tutorial to everyone after a meaningful change.
export const FASTMODE_TUTORIAL_KEY = "poveon_fastmode_tutorial_v1";

// ── Typewriter ────────────────────────────────────────────────────────────────
function Typewriter({ text, active, speed = 42, startDelay = 250 }: { text: string; active: boolean; speed?: number; startDelay?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) { setN(0); return; }
    setN(0);
    let i = 0;
    let interval: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) clearInterval(interval);
      }, speed);
    }, startDelay);
    return () => { clearTimeout(start); clearInterval(interval); };
  }, [active, text, speed, startDelay]);
  const done = n >= text.length;
  return (
    <span>
      {text.slice(0, n)}
      <span className={`inline-block w-[2px] h-[1.05em] -mb-[0.15em] bg-medical-500 ml-0.5 ${done ? "opacity-0" : "animate-pulse"}`} />
    </span>
  );
}

// Mock input surface used in the scenes
function MockInput({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-medical-200 bg-white px-3.5 py-3 text-[15px] leading-7 text-slate-800 min-h-[88px] shadow-sm">
      {children}
    </div>
  );
}

const SCENES = [
  {
    title: "Just type the test",
    caption: "Type the test you need in plain English. That’s the only thing required.",
  },
  {
    title: "Add patient details if you have them",
    caption: "Optionally add the name, age, phone or email — we sort it for the lab automatically. Leave anything out.",
  },
  {
    title: "Submit & get a code",
    caption: "One tap generates a code instantly. The lab receives everything, neatly sorted.",
  },
] as const;

export function FastModeTutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mounted, setMounted] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = SCENES.length - 1;

  useEffect(() => { setMounted(true); }, []);

  // Reset to the start each time it opens.
  useEffect(() => {
    if (open) { setStep(0); setPlaying(true); }
  }, [open]);

  // Auto-advance through the scenes once (stops on the last scene).
  useEffect(() => {
    if (!open || !playing) return;
    if (step >= last) return;
    timer.current = setTimeout(() => setStep((s) => Math.min(last, s + 1)), step === 0 ? 3400 : 4200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open, playing, step, last]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Dismiss the on-screen keyboard when the tutorial opens, otherwise it can sit
  // over the popup on mobile (e.g. when the input was autofocused underneath).
  useEffect(() => {
    if (open && typeof document !== "undefined") {
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }, [open]);

  function go(next: number) {
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, next)));
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[440px] max-h-[90dvh] overflow-y-auto bg-white rounded-3xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-medical-600 to-indigo-600 text-white">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            <p className="text-sm font-bold">How Fast Mode works</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-white/15 transition-colors" aria-label="Close tutorial">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scene */}
        <div className="px-5 pt-5 pb-4">
          <div className="h-[150px]">
            {step === 0 && (
              <MockInput>
                <Typewriter active={step === 0} text="FBC, malaria parasite and widal" />
              </MockInput>
            )}

            {step === 1 && (
              <div className="animate-fade-in space-y-3">
                <MockInput>
                  <Typewriter active={step === 1} text="FBC, MP, widal for Mrs Okafor, 42, 0803 124 5566, ada@mail.com" speed={26} />
                </MockInput>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { icon: <User className="w-3 h-3" />, label: "Name" },
                    { icon: <Calendar className="w-3 h-3" />, label: "Age" },
                    { icon: <Phone className="w-3 h-3" />, label: "Phone" },
                    { icon: <Mail className="w-3 h-3" />, label: "Email" },
                  ].map((c, i) => (
                    <span
                      key={c.label}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold animate-fade-in-up"
                      style={{ animationDelay: `${900 + i * 350}ms`, animationFillMode: "both" }}
                    >
                      <Check className="w-2.5 h-2.5" /> {c.icon} {c.label}
                    </span>
                  ))}
                  <span className="text-[11px] text-slate-400 self-center ml-1 animate-fade-in" style={{ animationDelay: "2300ms", animationFillMode: "both" }}>
                    — all optional
                  </span>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="animate-fade-in flex flex-col items-center justify-center h-full gap-3">
                <div className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-medical-600 text-white text-sm font-bold shadow-lg shadow-medical-600/30 animate-[tut-press_0.9s_ease-out]">
                  <Send className="w-4 h-4" /> Submit
                </div>
                <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 animate-fade-in-up" style={{ animationDelay: "700ms", animationFillMode: "both" }}>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Your code</span>
                  <p className="text-xl font-black text-emerald-700 font-mono tracking-widest text-center">POV-7QK2</p>
                </div>
              </div>
            )}
          </div>

          {/* Caption */}
          <div className="mt-3 text-center min-h-[64px]">
            <h3 className="text-base font-bold text-slate-800">{SCENES[step].title}</h3>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{SCENES[step].caption}</p>
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {SCENES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-medical-600" : "w-1.5 bg-slate-200 hover:bg-slate-300"}`}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          {/* Full-form hint — Fast Mode is the default, so point out the way back */}
          <p className="mt-3 text-center text-[11px] text-slate-400">
            Prefer the step-by-step form? Tap{" "}
            <span className="font-semibold text-medical-600">“Use full form”</span> at the top right anytime.
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
          {step > 0 ? (
            <button type="button" onClick={() => go(step - 1)} className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <button type="button" onClick={onClose} className="px-3 py-2.5 rounded-xl text-slate-400 text-sm font-semibold hover:bg-slate-50 transition">
              Skip
            </button>
          )}
          {step < last ? (
            <button type="button" onClick={() => go(step + 1)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 text-white text-sm font-bold transition shadow-sm">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={onClose} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 text-white text-sm font-bold transition shadow-sm">
              <Check className="w-4 h-4" /> Got it
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
