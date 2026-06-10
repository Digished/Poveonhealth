"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Send, ChevronDown, ChevronUp, User, Building2, Info, FilePlus2, ExternalLink, RefreshCw,
} from "lucide-react";
import {
  ReferralStatusBadge,
  ReferralTimeline,
  UrgencyBadge,
  formatReferralDate,
  type ReferralEvent,
} from "@/components/referral/shared";

interface DoctorReferral {
  id: string;
  code: string;
  status: string;
  patient_name: string;
  patient_age: number | null;
  patient_sex: string | null;
  patient_phone: string;
  hospital_number: string | null;
  from_hospital: string;
  specialty: string;
  urgency: string;
  clinical_note: string;
  provisional_diagnosis: string | null;
  response_note: string | null;
  created_at: string;
  to_hospital: { name: string; city: string | null; state: string | null } | null;
  events: Array<{
    type: string;
    actor_label: string | null;
    note: string | null;
    created_at: string;
  }>;
}

const STATUS_FILTERS = ["all", "pending", "accepted", "rejected", "redirected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function ReferralCard({ ref_ }: { ref_: DoctorReferral }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-slate-50/60 transition"
      >
        <div className="w-10 h-10 rounded-xl bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0 mt-0.5">
          <Send className="w-4 h-4 text-medical-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">{ref_.code}</span>
            <ReferralStatusBadge status={ref_.status} />
            <UrgencyBadge urgency={ref_.urgency} />
          </div>
          <p className="text-sm font-bold text-slate-800 mt-0.5 truncate">
            {ref_.to_hospital?.name ?? "—"}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <User className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 truncate">{ref_.patient_name}</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400 shrink-0">{formatReferralDate(ref_.created_at)}</span>
          </div>
        </div>
        <div className="shrink-0 text-slate-400 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/40">
          {/* Referral details */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Referral</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Patient</span>
                <span className="text-slate-700 font-medium">
                  {ref_.patient_name}
                  {ref_.patient_age != null ? `, ${ref_.patient_age} yrs` : ""}
                  {ref_.patient_sex ? `, ${ref_.patient_sex}` : ""}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Phone</span>
                <a href={`tel:${ref_.patient_phone}`} className="text-medical-600 font-medium">{ref_.patient_phone}</a>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">From</span>
                <span className="text-slate-700 font-medium">{ref_.from_hospital}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Specialty</span>
                <span className="text-slate-700 font-medium">{ref_.specialty}</span>
              </div>
              {ref_.to_hospital && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">To</span>
                  <span className="text-slate-700 font-medium">
                    {ref_.to_hospital.name}
                    {(ref_.to_hospital.city || ref_.to_hospital.state) &&
                      ` — ${[ref_.to_hospital.city, ref_.to_hospital.state].filter(Boolean).join(", ")}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {ref_.provisional_diagnosis && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Provisional Diagnosis</p>
              <p className="text-sm text-slate-700 leading-relaxed">{ref_.provisional_diagnosis}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Clinical Note</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-slate-100 rounded-xl px-3 py-2.5">
              {ref_.clinical_note}
            </p>
          </div>

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Timeline</p>
            <ReferralTimeline events={ref_.events as ReferralEvent[]} />
          </div>

          <Link
            href={`/refer/track/${ref_.code}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-medical-600 hover:text-medical-800 transition"
          >
            <ExternalLink className="w-3 h-3" />
            Open public tracking page
          </Link>
        </div>
      )}
    </div>
  );
}

export function DoctorReferralsSection() {
  const [referrals, setReferrals] = useState<DoctorReferral[]>([]);
  const [canRefer, setCanRefer] = useState(true);
  const [registeredHospitals, setRegisteredHospitals] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/doc-login/referrals");
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load referrals."); return; }
      setReferrals(data.referrals ?? []);
      setCanRefer(!!data.can_refer);
      setRegisteredHospitals(data.registered_hospitals ?? []);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? referrals : referrals.filter((r) => r.status === filter);
  const counts = STATUS_FILTERS.reduce<Record<StatusFilter, number>>((acc, s) => {
    acc[s] = s === "all" ? referrals.length : referrals.filter((r) => r.status === s).length;
    return acc;
  }, { all: 0, pending: 0, accepted: 0, rejected: 0, redirected: 0 });

  return (
    <div className="space-y-4">
      {/* New referral CTA */}
      <Link
        href="/refer"
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-medical-600 to-indigo-600 text-white font-semibold text-sm hover:from-medical-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
      >
        <FilePlus2 className="w-4 h-4" />
        New Referral
      </Link>

      {/* Registration banner */}
      {!loading && !canRefer && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 leading-relaxed">
            You can write referrals, but to <span className="font-semibold">send</span> them your hospital must first
            add your email on the Poveon referral network. Ask your hospital&apos;s administrator to add you from
            their referral dashboard.
          </p>
        </div>
      )}
      {!loading && canRefer && registeredHospitals.length > 0 && (
        <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-xl bg-white/70 border border-white/60">
          <Building2 className="w-3.5 h-3.5 text-medical-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Registered by: <span className="font-semibold text-slate-700">{registeredHospitals.join(", ")}</span>
          </p>
        </div>
      )}

      {/* Status filter chips */}
      {referrals.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => {
            const labels: Record<StatusFilter, string> = {
              all: "All", pending: "Pending", accepted: "Accepted", rejected: "Rejected", redirected: "Redirected",
            };
            const active: Record<StatusFilter, string> = {
              all: "bg-slate-800 text-white",
              pending: "bg-blue-500 text-white",
              accepted: "bg-emerald-500 text-white",
              rejected: "bg-red-500 text-white",
              redirected: "bg-amber-500 text-white",
            };
            const inactive: Record<StatusFilter, string> = {
              all: "bg-white text-slate-600 border border-slate-200",
              pending: "bg-white text-blue-700 border border-blue-200",
              accepted: "bg-white text-emerald-700 border border-emerald-200",
              rejected: "bg-white text-red-700 border border-red-200",
              redirected: "bg-white text-amber-700 border border-amber-200",
            };
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition shadow-sm ${filter === s ? active[s] : inactive[s]}`}
              >
                {labels[s]}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filter === s ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={load} className="flex items-center gap-1 text-xs font-semibold text-red-700 underline shrink-0">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                  <div className="h-4 bg-slate-100 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <Send className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">
            {filter === "all" ? "No referrals yet" : `No ${filter} referrals`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {filter === "all"
              ? "Patient referrals you send will appear here."
              : "Try switching to a different filter above."}
          </p>
        </div>
      )}

      {/* List */}
      {!loading && filtered.map((r) => <ReferralCard key={r.id} ref_={r} />)}
    </div>
  );
}
