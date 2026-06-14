"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, MapPin, Phone, Building2, RefreshCw, SearchX, Loader2,
} from "lucide-react";
import {
  REFERRAL_STATUS_CONFIG,
  ReferralTimeline,
  UrgencyBadge,
  formatReferralDate,
  type TrackedReferral,
  type ReferralStatus,
} from "@/components/referral/shared";

function CodeEntryCard({
  initialValue,
  notFoundMessage,
  loading,
  onLookup,
}: {
  initialValue?: string;
  notFoundMessage?: string;
  loading: boolean;
  onLookup: (code: string) => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const code = value.trim().toUpperCase();
    if (!code) return;
    onLookup(code);
  }

  return (
    <div className="glass-card p-5">
      {notFoundMessage ? (
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-3">
            <SearchX className="w-6 h-6 text-amber-500" />
          </div>
          <p className="text-sm font-bold text-slate-700">{notFoundMessage}</p>
          <p className="text-xs text-slate-400 mt-1">
            Double-check the code on your referral letter, SMS or email — it looks like REF-XXXXXXX.
          </p>
        </div>
      ) : (
        <div className="text-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-medical-50 border border-medical-100 flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6 text-medical-500" />
          </div>
          <p className="text-sm font-bold text-slate-700">Track a referral</p>
          <p className="text-xs text-slate-400 mt-1">Enter the referral code from your letter, SMS or email.</p>
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="REF-XXXXXXX"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono tracking-widest uppercase placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition-all shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Track
        </button>
      </form>
    </div>
  );
}

export function ReferralTracker({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode?.trim().toUpperCase() ?? "");
  const [referral, setReferral] = useState<TrackedReferral | null>(null);
  const [loading, setLoading] = useState(!!initialCode);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const lookup = useCallback(async (lookupCode: string) => {
    setLoading(true);
    setNotFound(false);
    setError("");
    try {
      const res = await fetch(`/api/referrals/track?code=${encodeURIComponent(lookupCode)}`);
      const data = await res.json();
      if (res.status === 404 || res.status === 400) {
        setReferral(null);
        setNotFound(true);
        return;
      }
      if (!res.ok || !data.referral) {
        setReferral(null);
        setError(data.error ?? "Failed to look up the referral. Please try again.");
        return;
      }
      setReferral(data.referral);
    } catch {
      setReferral(null);
      setError("Network error — please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (code) lookup(code);
  }, [code, lookup]);

  function handleManualLookup(newCode: string) {
    if (newCode === code) {
      lookup(newCode); // same code — the effect won't refire, look it up directly
    } else {
      setCode(newCode);
    }
    // Keep the URL shareable
    router.replace(`/refer/track/${encodeURIComponent(newCode)}`);
  }

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-16 rounded-2xl bg-white/70" />
        <div className="h-40 rounded-2xl bg-white/70" />
        <div className="h-56 rounded-2xl bg-white/70" />
      </div>
    );
  }

  // ── Error / not found / empty entry ──
  if (!referral) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => code && lookup(code)}
              className="flex items-center gap-1 text-xs font-semibold text-red-700 underline shrink-0"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}
        <CodeEntryCard
          initialValue={notFound ? code : ""}
          notFoundMessage={notFound ? `No referral found for “${code}”` : undefined}
          loading={loading}
          onLookup={handleManualLookup}
        />
      </div>
    );
  }

  const st = REFERRAL_STATUS_CONFIG[(referral.status as ReferralStatus)] ?? REFERRAL_STATUS_CONFIG.pending;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Status banner */}
      <div className={`rounded-2xl border px-4 py-3.5 flex items-start gap-3 ${st.banner}`}>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${st.dot} ${referral.status === "pending" ? "animate-pulse" : ""}`} />
        <div className="min-w-0">
          <p className="text-sm font-bold">{st.label}</p>
          <p className="text-xs opacity-80 mt-0.5">{st.description}</p>
          {referral.response_note && (
            <p className="text-xs mt-2 bg-white/60 rounded-lg px-2.5 py-1.5 leading-relaxed whitespace-pre-wrap">
              {referral.response_note}
            </p>
          )}
        </div>
      </div>

      {/* Referral summary (public — no clinical note) */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Referral</p>
          <span className="text-xs font-mono font-bold text-medical-700 bg-medical-50 border border-medical-100 px-2.5 py-1 rounded-lg tracking-widest">
            {referral.code}
          </span>
        </div>
        <div className="space-y-2.5 text-sm">
          <div className="flex gap-3">
            <span className="text-slate-400 w-24 shrink-0 text-xs pt-0.5">Patient</span>
            <span className="text-slate-800 font-semibold">{referral.patient_name}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-slate-400 w-24 shrink-0 text-xs pt-0.5">Referred by</span>
            <span className="text-slate-700 font-medium">{referral.doctor_name}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-slate-400 w-24 shrink-0 text-xs pt-0.5">From</span>
            <span className="text-slate-700 font-medium">{referral.from_hospital}</span>
          </div>
          <div className="flex gap-3">
            <span className="text-slate-400 w-24 shrink-0 text-xs pt-0.5">Specialty</span>
            <span className="text-slate-700 font-medium">{referral.specialty}</span>
          </div>
          <div className="flex gap-3 items-center">
            <span className="text-slate-400 w-24 shrink-0 text-xs">Urgency</span>
            <UrgencyBadge urgency={referral.urgency} />
          </div>
          <div className="flex gap-3">
            <span className="text-slate-400 w-24 shrink-0 text-xs pt-0.5">Created</span>
            <span className="text-slate-700 font-medium">{formatReferralDate(referral.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Destination hospital */}
      {referral.to_hospital && (
        <div className="glass-card p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Destination Hospital</p>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-medical-100 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-medical-600" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-bold text-slate-800">{referral.to_hospital.name}</p>
              {(referral.to_hospital.city || referral.to_hospital.state) && (
                <p className="text-xs text-slate-500">
                  {[referral.to_hospital.city, referral.to_hospital.state].filter(Boolean).join(", ")}
                </p>
              )}
              {referral.to_hospital.address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(referral.to_hospital.name + " " + referral.to_hospital.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-1.5 group"
                >
                  <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-medical-400" />
                  <span className="text-xs text-medical-600 group-hover:underline">{referral.to_hospital.address}</span>
                </a>
              )}
              {referral.to_hospital.phone && (
                <a href={`tel:${referral.to_hospital.phone}`} className="flex items-center gap-1.5 text-xs font-medium text-medical-700 hover:text-medical-900 transition-colors">
                  <Phone className="w-3 h-3 shrink-0 text-medical-400" />
                  {referral.to_hospital.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="glass-card p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">Progress</p>
        <ReferralTimeline events={referral.events} />
      </div>

      <p className="text-xs text-slate-400 text-center leading-relaxed px-4 pb-4">
        For privacy, the clinical details of this referral are only visible to the doctor and the hospitals involved.
      </p>
    </div>
  );
}
