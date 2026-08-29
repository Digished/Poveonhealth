"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FlaskConical, HeartPulse, MessageSquareText, Pill, RefreshCw, X } from "lucide-react";
import { getJson, invalidateJson } from "@/lib/client-cache";
import type { CarePlanBenefits, CarePlanPrefill } from "@/components/consults/CarePlanEnrollModal";
import { useViewport } from "@/components/ui/Overlay";

/** Sensible copy to show if the care-plan endpoint is briefly unavailable. */
const FALLBACK_BENEFITS: CarePlanBenefits = {
  price_naira: 10_000,
  message_allowance: 40,
  lab_discount_percent: 15,
  pharmacy_discount_percent: 10,
};

export type CarePlanState = {
  loading: boolean;
  /** True only while a paid year is running. */
  active: boolean;
  /**
   * They had a plan that has since run out or been cancelled — so we say
   * "renew". An abandoned sign-up that never got paid for is NOT this: those
   * people have never had a plan and should be invited to start one.
   */
  lapsed: boolean;
  benefits: CarePlanBenefits;
  prefill: CarePlanPrefill;
  refresh: () => void;
};

/**
 * The signed-in patient's care-plan status.
 *
 * Shared by the dashboard shell (for the prompt) and the Care Plan panel — the
 * client cache collapses both callers onto one request. Benefits always have a
 * value, so a failed call still shows the invitation rather than a blank tab.
 */
export function useCarePlan(): CarePlanState {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [lapsed, setLapsed] = useState(false);
  const [benefits, setBenefits] = useState<CarePlanBenefits>(FALLBACK_BENEFITS);
  const [prefill, setPrefill] = useState<CarePlanPrefill>({});

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const d = await getJson<{
        success?: boolean;
        member: { status: string } | null;
        benefits?: CarePlanBenefits;
        prefill?: CarePlanPrefill;
      }>("/api/consults/me", { force });
      if (!d?.success) return;
      setActive(d.member?.status === "active");
      // pending_payment means they started and never paid — never "ended".
      setLapsed(d.member?.status === "expired" || d.member?.status === "cancelled");
      if (d.benefits) setBenefits(d.benefits);
      if (d.prefill) setPrefill(d.prefill);
    } catch {
      // Leave the fallback benefits in place — the invitation still renders.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => {
    invalidateJson("/api/consults/me");
    load(true);
  }, [load]);

  return { loading, active, lapsed, benefits, prefill, refresh };
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/**
 * The strip that sits where the profile card used to, on every tab, until the
 * patient is on a live plan.
 */
export function CarePlanPromptCard({
  benefits, lapsed, onJoin,
}: {
  benefits: CarePlanBenefits; lapsed: boolean; onJoin: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJoin}
      className="group flex w-full items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-medical-600 to-medical-800 p-4 text-left text-white shadow-lg shadow-medical-600/20 transition hover:shadow-xl sm:p-5"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        {lapsed ? <RefreshCw className="h-5 w-5" /> : <HeartPulse className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold sm:text-base">
          {lapsed ? "Your care plan has ended" : "Living with hypertension or diabetes?"}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/80 sm:text-sm">
          {lapsed
            ? "Renew to get your care code working again and pick up with a doctor."
            : `${naira(benefits.price_naira)} a year: up to ${benefits.lab_discount_percent}% off tests, up to ${benefits.pharmacy_discount_percent}% off medication, and ${benefits.message_allowance} messages to your own doctor.`}
        </p>
      </div>
      <span className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-medical-700 transition group-hover:bg-medical-50 sm:inline-flex">
        {lapsed ? "Renew" : "Join"}
        <ArrowRight className="h-4 w-4" />
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 text-white/70 sm:hidden" />
    </button>
  );
}

/**
 * Shown once per sign-in until the patient is on a live plan. Deliberately
 * dismissible — it returns next time they sign in, not next time they click.
 */
export function CarePlanPromptModal({
  benefits, lapsed, onJoin, onClose,
}: {
  benefits: CarePlanBenefits; lapsed: boolean; onJoin: () => void; onClose: () => void;
}) {
  const vp = useViewport(true);
  return (
    <div
      className="animate-fade-in fixed z-[290] flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
      // Anchored to the visual viewport, not the layout one: when the mobile
      // keyboard opens the two stop agreeing, and a dialog sized to the layout
      // viewport puts its own inputs behind the keys.
      style={vp.height ? { top: vp.top, left: vp.left, width: vp.width, height: vp.height } : { inset: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Join the Poveon Care Plan"
    >
      <div className="animate-slide-up w-full overflow-hidden rounded-3xl bg-white shadow-2xl sm:max-w-md">
        <div className="relative bg-gradient-to-br from-medical-600 to-medical-800 px-6 pb-7 pt-7 text-center text-white">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
            {lapsed ? <RefreshCw className="h-7 w-7" /> : <HeartPulse className="h-7 w-7" />}
          </div>
          <h3 className="text-lg font-bold">
            {lapsed ? "Your care plan has ended" : "A year of care for " + naira(benefits.price_naira)}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-white/80">
            {lapsed
              ? "Renew to get your care code working again and pick up with a doctor."
              : "For people living with hypertension or diabetes — cheaper tests, cheaper prescriptions, and a doctor who knows your name."}
          </p>
        </div>

        <div className="space-y-3 p-5">
          <Line icon={<FlaskConical className="h-4 w-4" />}>
            Up to {benefits.lab_discount_percent}% off lab tests at partner labs
          </Line>
          <Line icon={<Pill className="h-4 w-4" />}>
            Up to {benefits.pharmacy_discount_percent}% off medication at partner pharmacies
          </Line>
          <Line icon={<MessageSquareText className="h-4 w-4" />}>
            {benefits.message_allowance} messages to your own doctor, all year
          </Line>

          <button
            onClick={onJoin}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-medical-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-medical-600/30 transition-all hover:bg-medical-700 active:scale-[0.98]"
          >
            {lapsed ? "Renew my plan" : `Join for ${naira(benefits.price_naira)} a year`}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-600">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-medical-50 text-medical-600">
        {icon}
      </span>
      {children}
    </div>
  );
}
