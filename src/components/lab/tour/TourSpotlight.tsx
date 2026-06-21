"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Check, X, GraduationCap } from "lucide-react";
import { useLabTour } from "./TourProvider";

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 8;

/**
 * Renders the dimmed overlay with a cut-out highlight around the current step's
 * target (`[data-tour="<key>"]`) plus a tooltip card. If the target isn't on
 * screen yet, the tour renders NOTHING and keeps watching — the step appears,
 * highlighted, only once its button shows up (no waiting card, no forced skip).
 */
export function TourSpotlight() {
  const { steps, stepIndex, next, prev, stop } = useLabTour();
  const step = steps[stepIndex];
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    if (!step) return;
    let raf = 0;
    let scrolledKey = "";
    // Re-measure the target's box; only scroll it into view once per step so we
    // don't fight the user's scrolling or thrash layout on every tick. A target
    // that's not actually visible (display:none / unmounted) counts as absent.
    function measure() {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.key}"]`);
      if (el && el.offsetParent !== null) {
        if (scrolledKey !== step.key) { scrolledKey = step.key; el.scrollIntoView({ block: "center", behavior: "smooth" }); }
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        scrolledKey = ""; // re-scroll once it appears
        setRect(null);
      }
    }
    raf = requestAnimationFrame(measure);
    const onChange = () => { raf = requestAnimationFrame(measure); };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    // Poll so a step lights up the moment its button appears (drawer/tab change).
    const interval = setInterval(measure, 500);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      clearInterval(interval);
    };
  }, [step]);

  // Render nothing until this step's button is actually on screen — the tour
  // simply waits (however long) and pops up highlighted when it appears.
  if (!mounted || !step || !rect) return null;

  const isLast = stepIndex >= steps.length - 1;
  const isFirst = stepIndex === 0;

  // Placement: mobile → full-width bottom sheet (can't overflow); desktop →
  // anchored below/above the target and clamped to the viewport.
  const vw = window.innerWidth;
  const sheet = vw < 640;
  const anchored = (() => {
    if (sheet) return null;
    const vh = window.innerHeight;
    const width = Math.min(320, vw - 24);
    const cardH = 240;
    const spaceBelow = vh - (rect.top + rect.height);
    const rawTop = spaceBelow > cardH + 24 ? rect.top + rect.height + 12 : rect.top - cardH - 12;
    const top = Math.max(12, Math.min(rawTop, vh - cardH - 12));
    const left = Math.max(12, Math.min(rect.left, vw - width - 12));
    return { top, left, width };
  })();

  return createPortal(
    <div className="fixed inset-0 z-[10001]">
      {/* Dimmed backdrop with a cut-out ring around the target */}
      <div
        className="pointer-events-none absolute rounded-xl ring-2 ring-medical-400 transition-all"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.72)",
        }}
      />

      {/* Tooltip card */}
      <div
        className={`absolute rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl animate-scale-in ${
          sheet ? "bottom-4 left-3 right-3" : "w-[320px] max-w-[calc(100vw-24px)]"
        }`}
        style={anchored ? { top: anchored.top, left: anchored.left, width: anchored.width } : undefined}
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-medical-300">
            <GraduationCap className="h-3.5 w-3.5" /> Guide · {stepIndex + 1}/{steps.length}
          </span>
          <button onClick={stop} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="End tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h4 className="text-sm font-bold text-white">{step.title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{step.body}</p>

        {/* Dots (wrap so 10 steps never overflow on mobile) */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === stepIndex ? "w-4 bg-medical-500" : "w-1.5 bg-white/15"}`} />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {!isFirst ? (
            <button onClick={prev} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/5">
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </button>
          ) : (
            <button onClick={stop} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 hover:bg-white/5">Skip</button>
          )}
          <button onClick={next} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-medical-600 py-1.5 text-xs font-bold text-white hover:bg-medical-700">
            {isLast ? <><Check className="h-3.5 w-3.5" /> Done</> : <>Next <ChevronRight className="h-3.5 w-3.5" /></>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
