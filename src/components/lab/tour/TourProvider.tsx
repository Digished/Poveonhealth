"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LAB_TOUR_KEY, LAB_TOUR_STEPS, type TourStep } from "./steps";
import { TourSpotlight } from "./TourSpotlight";

interface TourContextValue {
  /** Tutorial mode preference (persisted). When on, the tour auto-runs and
   *  pending-action highlights are emphasised. */
  enabled: boolean;
  toggle: () => void;
  /** Whether the step spotlight is actively showing. */
  running: boolean;
  start: () => void;
  stop: () => void;
  stepIndex: number;
  steps: TourStep[];
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useLabTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useLabTour must be used within TourProvider");
  return ctx;
}

const ENABLED_KEY = `${LAB_TOUR_KEY}_enabled`;
const SEEN_KEY = `${LAB_TOUR_KEY}_seen`;

export function TourProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = LAB_TOUR_STEPS;

  // Load the saved preference and auto-start once for first-time users.
  useEffect(() => {
    try {
      const savedEnabled = localStorage.getItem(ENABLED_KEY);
      if (savedEnabled === "1") setEnabled(true);
      if (!localStorage.getItem(SEEN_KEY)) {
        localStorage.setItem(SEEN_KEY, "1");
        setEnabled(true);
        setStepIndex(0);
        setRunning(true);
      }
    } catch { /* ignore */ }
  }, []);

  const persistEnabled = (v: boolean) => {
    try { localStorage.setItem(ENABLED_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  };

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const nextVal = !prev;
      persistEnabled(nextVal);
      if (nextVal) { setStepIndex(0); setRunning(true); }
      else setRunning(false);
      return nextVal;
    });
  }, []);

  const start = useCallback(() => { setStepIndex(0); setRunning(true); }, []);
  const stop = useCallback(() => setRunning(false), []);
  const goTo = useCallback((i: number) => setStepIndex(Math.max(0, Math.min(steps.length - 1, i))), [steps.length]);
  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) { setRunning(false); return i; }
      return i + 1;
    });
  }, [steps.length]);
  const prev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const value = useMemo<TourContextValue>(() => ({
    enabled, toggle, running, start, stop, stepIndex, steps, next, prev, goTo,
  }), [enabled, toggle, running, start, stop, stepIndex, steps, next, prev, goTo]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {running && <TourSpotlight />}
    </TourContext.Provider>
  );
}
