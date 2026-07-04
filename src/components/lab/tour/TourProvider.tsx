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
  /** Jump to a step by its key, but only while the tour is running (contextual). */
  goToKey: (key: string) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useLabTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useLabTour must be used within TourProvider");
  return ctx;
}

const ENABLED_KEY = `${LAB_TOUR_KEY}_enabled`;
const SEEN_KEY = `${LAB_TOUR_KEY}_seen`;

export function TourProvider({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const steps = LAB_TOUR_STEPS;

  // Load the saved preference and auto-start once for first-time users.
  // When disabled (e.g. Lite mode has no tutorial), never auto-start.
  useEffect(() => {
    if (disabled) return;
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
  }, [disabled]);

  // Stop a running tour immediately when the tutorial becomes disabled
  // (e.g. the lab switches to Lite mode mid-session).
  useEffect(() => {
    if (disabled) setRunning(false);
  }, [disabled]);

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
  // Forward-only: surfacing a contextual step (e.g. drawer opens) should never
  // drag the user back to an earlier step they've already passed.
  const goToKey = useCallback((key: string) => {
    const i = steps.findIndex((s) => s.key === key);
    if (i >= 0) setStepIndex((cur) => (i > cur ? i : cur));
  }, [steps]);
  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) { setRunning(false); return i; }
      return i + 1;
    });
  }, [steps.length]);
  const prev = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const value = useMemo<TourContextValue>(() => ({
    enabled: enabled && !disabled, toggle, running: running && !disabled, start, stop, stepIndex, steps, next, prev, goTo, goToKey,
  }), [enabled, disabled, toggle, running, start, stop, stepIndex, steps, next, prev, goTo, goToKey]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {running && !disabled && <TourSpotlight />}
    </TourContext.Provider>
  );
}
