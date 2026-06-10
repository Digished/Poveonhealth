"use client";

import { Clock, CheckCircle, XCircle, ArrowRightLeft, FilePlus2 } from "lucide-react";

// ─── Types shared by the referral UI ─────────────────────────────────────────

export type ReferralStatus = "pending" | "accepted" | "rejected" | "redirected";
export type ReferralUrgency = "routine" | "urgent" | "emergency";

export interface ReferralEvent {
  type: "created" | "accepted" | "rejected" | "redirected";
  actor_label: string | null;
  from_hospital?: string | null;
  to_hospital?: string | null;
  note: string | null;
  created_at: string;
}

export interface TrackedReferral {
  code: string;
  status: ReferralStatus;
  patient_name: string;
  doctor_name: string;
  from_hospital: string;
  specialty: string;
  urgency: ReferralUrgency;
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
  to_hospital: {
    name: string;
    city?: string | null;
    state?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
  events: ReferralEvent[];
}

// ─── Status / urgency display config ─────────────────────────────────────────

export const REFERRAL_STATUS_CONFIG: Record<
  ReferralStatus,
  { label: string; badge: string; banner: string; dot: string; description: string }
> = {
  pending: {
    label: "Pending review",
    badge: "bg-blue-50 text-blue-700 border border-blue-200",
    banner: "bg-blue-50 border-blue-200 text-blue-800",
    dot: "bg-blue-500",
    description: "The receiving hospital is reviewing this referral.",
  },
  accepted: {
    label: "Accepted",
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    banner: "bg-emerald-50 border-emerald-200 text-emerald-800",
    dot: "bg-emerald-500",
    description: "The hospital has accepted this referral.",
  },
  rejected: {
    label: "Not accepted",
    badge: "bg-red-50 text-red-700 border border-red-200",
    banner: "bg-red-50 border-red-200 text-red-800",
    dot: "bg-red-500",
    description: "The hospital could not accept this referral.",
  },
  redirected: {
    label: "Redirected",
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
    banner: "bg-amber-50 border-amber-200 text-amber-800",
    dot: "bg-amber-500",
    description: "This referral was redirected to another hospital.",
  },
};

export const URGENCY_CONFIG: Record<ReferralUrgency, { label: string; badge: string }> = {
  routine: { label: "Routine", badge: "bg-slate-100 text-slate-600 border border-slate-200" },
  urgent: { label: "Urgent", badge: "bg-amber-50 text-amber-700 border border-amber-200" },
  emergency: { label: "Emergency", badge: "bg-red-50 text-red-700 border border-red-200" },
};

export function ReferralStatusBadge({ status }: { status: string }) {
  const cfg =
    (REFERRAL_STATUS_CONFIG as Record<string, (typeof REFERRAL_STATUS_CONFIG)[ReferralStatus]>)[status] ??
    REFERRAL_STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const cfg =
    (URGENCY_CONFIG as Record<string, (typeof URGENCY_CONFIG)[ReferralUrgency]>)[urgency] ??
    URGENCY_CONFIG.routine;
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

export function formatReferralDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return String(iso);
  }
}

export function formatReferralDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

// ─── Vertical event timeline ──────────────────────────────────────────────────

const EVENT_CONFIG: Record<ReferralEvent["type"], { label: string; icon: React.ReactNode; iconBg: string }> = {
  created: {
    label: "Referral created",
    icon: <FilePlus2 className="w-3.5 h-3.5 text-medical-600" />,
    iconBg: "bg-medical-50 border-medical-200",
  },
  accepted: {
    label: "Accepted by hospital",
    icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />,
    iconBg: "bg-emerald-50 border-emerald-200",
  },
  rejected: {
    label: "Not accepted",
    icon: <XCircle className="w-3.5 h-3.5 text-red-600" />,
    iconBg: "bg-red-50 border-red-200",
  },
  redirected: {
    label: "Redirected",
    icon: <ArrowRightLeft className="w-3.5 h-3.5 text-amber-600" />,
    iconBg: "bg-amber-50 border-amber-200",
  },
};

export function ReferralTimeline({ events }: { events: ReferralEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Clock className="w-3.5 h-3.5" />
        No updates yet.
      </div>
    );
  }
  return (
    <ol className="space-y-0">
      {events.map((ev, i) => {
        const cfg = EVENT_CONFIG[ev.type] ?? EVENT_CONFIG.created;
        const last = i === events.length - 1;
        return (
          <li key={i} className="relative flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
                {cfg.icon}
              </div>
              {!last && <div className="w-px flex-1 min-h-4 bg-slate-200" />}
            </div>
            <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
              <p className="text-sm font-semibold text-slate-800 leading-tight">
                {cfg.label}
                {ev.type === "redirected" && ev.to_hospital && (
                  <span className="font-normal text-slate-600"> to {ev.to_hospital}</span>
                )}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {formatReferralDateTime(ev.created_at)}
                {ev.actor_label ? ` · ${ev.actor_label}` : ""}
              </p>
              {ev.type === "redirected" && ev.from_hospital && (
                <p className="text-xs text-slate-500 mt-0.5">From {ev.from_hospital}</p>
              )}
              {ev.note && (
                <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 leading-relaxed whitespace-pre-wrap">
                  {ev.note}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
