"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  Search, Inbox, User, Stethoscope, Clock, CheckCircle, XCircle,
  CornerUpRight, X, Phone, Mail, FileText, AlertTriangle, Zap,
  Building2, MapPin, Loader2, ChevronRight, Hash, FileDown,
} from "lucide-react";
import {
  Referral, ReferralStatus, ReferralUrgency, SuggestedHospital, formatDateTime, timeAgo,
} from "./types";

const STATUS_BADGE: Record<ReferralStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:    { label: "Pending",    cls: "bg-amber-50 text-amber-700 border border-amber-200",     icon: <Clock className="w-3 h-3" /> },
  accepted:   { label: "Accepted",   cls: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <CheckCircle className="w-3 h-3" /> },
  rejected:   { label: "Rejected",   cls: "bg-red-50 text-red-700 border border-red-200",           icon: <XCircle className="w-3 h-3" /> },
  redirected: { label: "Redirected", cls: "bg-violet-50 text-violet-700 border border-violet-200",  icon: <CornerUpRight className="w-3 h-3" /> },
};

function UrgencyBadge({ urgency }: { urgency: ReferralUrgency }) {
  if (urgency === "emergency") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-600 text-white">
        <Zap className="w-3 h-3" /> Emergency
      </span>
    );
  }
  if (urgency === "urgent") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
        <AlertTriangle className="w-3 h-3" /> Urgent
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
      Routine
    </span>
  );
}

function patientSummary(r: Referral) {
  const bits: string[] = [];
  if (r.patient_age !== null && r.patient_age !== undefined && `${r.patient_age}` !== "") bits.push(`${r.patient_age} yrs`);
  if (r.patient_sex) bits.push(r.patient_sex.charAt(0).toUpperCase() + r.patient_sex.slice(1));
  return bits.join(" · ");
}

// ─── Redirect hospital picker ────────────────────────────────────────────────
function RedirectPicker({
  specialty, excludeId, selected, onSelect,
}: {
  specialty: string | null;
  excludeId: string;
  selected: SuggestedHospital | null;
  onSelect: (h: SuggestedHospital | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SuggestedHospital[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (query: string) => {
    setSearching(true);
    try {
      const params = new URLSearchParams();
      if (specialty) params.set("specialty", specialty);
      if (query) params.set("q", query);
      params.set("exclude", excludeId);
      const res = await fetch(`/api/referrals/suggest?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setResults(data.hospitals ?? []);
    } catch {
      // silent — list just stays as-is
    } finally {
      setSearching(false);
    }
  }, [specialty, excludeId]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q.trim()), q ? 300 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, search]);

  if (selected) {
    return (
      <div className="flex items-start justify-between gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-violet-800 truncate">{selected.name}</p>
          {(selected.city || selected.state) && (
            <p className="text-xs text-violet-500 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 shrink-0" />
              {[selected.city, selected.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <button type="button" onClick={() => onSelect(null)}
          className="text-xs font-semibold text-violet-600 hover:text-violet-800 shrink-0 underline underline-offset-2">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={specialty ? `Search ${specialty} hospitals…` : "Search hospitals by name or city…"}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition"
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100 bg-white">
        {searching && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" /> Searching…
          </div>
        )}
        {!searching && results.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4 px-3">
            No hospitals found{specialty ? ` for ${specialty}` : ""}. Try a different search.
          </p>
        )}
        {!searching && results.map((h) => (
          <button key={h.id} type="button" onClick={() => onSelect(h)}
            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-medical-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 truncate">{h.name}</p>
              <p className="text-xs text-slate-400 truncate">
                {[h.city, h.state].filter(Boolean).join(", ") || h.address || "—"}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Referral detail modal ───────────────────────────────────────────────────
type ActionKind = "accept" | "reject" | "redirect";

function ReferralDetail({
  referral, hospitalId, onClose, onUpdated,
}: {
  referral: Referral;
  hospitalId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [action, setAction] = useState<ActionKind | null>(null);
  const [note, setNote] = useState("");
  const [redirectTo, setRedirectTo] = useState<SuggestedHospital | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const badge = STATUS_BADGE[referral.status] ?? STATUS_BADGE.pending;

  async function submitAction(kind: ActionKind) {
    if (kind === "redirect" && !redirectTo) {
      toast.error("Please pick a hospital to redirect to.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/hospital/referrals/${referral.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: kind,
          note: note.trim() || undefined,
          ...(kind === "redirect" && redirectTo ? { redirect_hospital_id: redirectTo.id } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Action failed. Please try again.");
        return;
      }
      toast.success(
        kind === "accept" ? "Referral accepted."
        : kind === "reject" ? "Referral rejected."
        : `Referral redirected to ${redirectTo?.name}.`,
      );
      onUpdated();
      onClose();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const labelCls = "text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2";
  const textareaCls = "w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-medical-400 bg-white resize-none text-slate-800 placeholder-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-backdrop-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[85dvh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-sheet-up sm:animate-scale-in flex flex-col">

        {/* Modal header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-400 font-mono tracking-wider flex items-center gap-1">
                <Hash className="w-3 h-3" />{referral.code}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                {badge.icon}{badge.label}
              </span>
              <UrgencyBadge urgency={referral.urgency} />
            </div>
            <p className="text-base font-bold text-slate-800 mt-1 truncate">{referral.patient_name}</p>
            {patientSummary(referral) && <p className="text-xs text-slate-400">{patientSummary(referral)}</p>}
          </div>
          <a
            href={`/api/hospital/referrals/${referral.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-medical-200 bg-medical-50 text-medical-700 hover:bg-medical-100 text-xs font-semibold transition shrink-0"
            title="Open the referral letter as a PDF"
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">Open as PDF</span>
            <span className="sm:hidden">PDF</span>
          </a>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-5 py-4 space-y-5 flex-1">

          {/* Referral meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Specialty</p>
              <p className="text-slate-700 font-medium flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-medical-500 shrink-0" />
                {referral.specialty ?? "—"}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Received</p>
              <p className="text-slate-700 font-medium">{formatDateTime(referral.created_at)}</p>
            </div>
          </div>

          {/* Referring doctor */}
          <div>
            <p className={labelCls}>Referring Doctor</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Name</span>
                <span className="text-slate-700 font-medium">{referral.doctor_name ?? "—"}</span>
              </div>
              {referral.from_hospital && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">From</span>
                  <span className="text-slate-700 font-medium">{referral.from_hospital}</span>
                </div>
              )}
              {referral.doctor_phone && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Phone</span>
                  <a href={`tel:${referral.doctor_phone}`} className="text-medical-600 font-medium">{referral.doctor_phone}</a>
                </div>
              )}
              {referral.doctor_email && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Email</span>
                  <span className="text-slate-700 font-medium break-all">{referral.doctor_email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Patient contact */}
          <div>
            <p className={labelCls}>Patient</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Name</span>
                <span className="text-slate-700 font-medium">{referral.patient_name}</span>
              </div>
              {patientSummary(referral) && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Age / Sex</span>
                  <span className="text-slate-700 font-medium">{patientSummary(referral)}</span>
                </div>
              )}
              {referral.hospital_number && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Hospital No.</span>
                  <span className="text-slate-700 font-medium">{referral.hospital_number}</span>
                </div>
              )}
              {referral.patient_phone && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Phone</span>
                  <a href={`tel:${referral.patient_phone}`} className="text-medical-600 font-medium flex items-center gap-1">
                    <Phone className="w-3 h-3" />{referral.patient_phone}
                  </a>
                </div>
              )}
              {referral.patient_email && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Email</span>
                  <a href={`mailto:${referral.patient_email}`} className="text-medical-600 font-medium break-all flex items-center gap-1">
                    <Mail className="w-3 h-3 shrink-0" />{referral.patient_email}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Provisional diagnosis */}
          {referral.provisional_diagnosis && (
            <div>
              <p className={labelCls}>Provisional Diagnosis</p>
              <p className="text-sm text-slate-700 font-medium leading-relaxed">{referral.provisional_diagnosis}</p>
            </div>
          )}

          {/* Clinical note — document-like rendering */}
          {referral.clinical_note && (
            <div>
              <p className={labelCls}>Clinical Note</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 pb-2 border-b border-slate-200/70">
                  <FileText className="w-3 h-3" /> Referral letter
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-[450]">
                  {referral.clinical_note}
                </p>
              </div>
            </div>
          )}

          {/* Response note (already responded) */}
          {referral.response_note && (
            <div>
              <p className={labelCls}>Response Note</p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                {referral.response_note}
              </p>
            </div>
          )}

          {/* Event timeline */}
          {referral.events.length > 0 && (
            <div>
              <p className={labelCls}>Timeline</p>
              <div className="space-y-0">
                {referral.events.map((ev, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-medical-400 mt-1.5 shrink-0" />
                      {i < referral.events.length - 1 && <div className="w-px flex-1 bg-slate-200 my-0.5" />}
                    </div>
                    <div className="pb-4 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 capitalize">
                        {ev.type.replace(/_/g, " ")}
                        {ev.actor_label && <span className="font-normal text-slate-400"> — {ev.actor_label}</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">{formatDateTime(ev.created_at)}</p>
                      {ev.note && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{ev.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action bar — pending referrals only */}
        {referral.status === "pending" && (
          <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/60 shrink-0 space-y-3">
            {action === null && (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { setAction("accept"); setNote(""); }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition shadow-sm">
                  <CheckCircle className="w-4 h-4" /> Accept
                </button>
                <button onClick={() => { setAction("reject"); setNote(""); }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs sm:text-sm font-semibold transition shadow-sm">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button onClick={() => { setAction("redirect"); setNote(""); setRedirectTo(null); }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white border border-violet-200 text-violet-600 hover:bg-violet-50 text-xs sm:text-sm font-semibold transition shadow-sm">
                  <CornerUpRight className="w-4 h-4" /> Redirect
                </button>
              </div>
            )}

            {action === "accept" && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5" /> Accept this referral
                </p>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note for the referring doctor (e.g. when the patient should come)…"
                  className={textareaCls} maxLength={1000} />
                <div className="flex gap-2">
                  <button onClick={() => submitAction("accept")} disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold transition shadow-sm">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Confirm Accept
                  </button>
                  <button onClick={() => setAction(null)} disabled={submitting}
                    className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 transition">
                    Back
                  </button>
                </div>
              </div>
            )}

            {action === "reject" && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> Reject this referral
                </p>
                <p className="text-xs text-slate-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  This will notify the referring doctor that you cannot take this patient. Please explain why so they can arrange alternative care.
                </p>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason for rejecting (strongly encouraged)…"
                  className={textareaCls} maxLength={1000} />
                <div className="flex gap-2">
                  <button onClick={() => submitAction("reject")} disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold transition shadow-sm">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Confirm Rejection
                  </button>
                  <button onClick={() => setAction(null)} disabled={submitting}
                    className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 transition">
                    Back
                  </button>
                </div>
              </div>
            )}

            {action === "redirect" && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                  <CornerUpRight className="w-3.5 h-3.5" /> Redirect to another hospital
                </p>
                <RedirectPicker
                  specialty={referral.specialty}
                  excludeId={hospitalId}
                  selected={redirectTo}
                  onSelect={setRedirectTo}
                />
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note (e.g. why you are redirecting)…"
                  className={textareaCls} maxLength={1000} />
                <div className="flex gap-2">
                  <button onClick={() => submitAction("redirect")} disabled={submitting || !redirectTo}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-semibold transition shadow-sm">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CornerUpRight className="w-4 h-4" />}
                    {redirectTo ? `Confirm Redirect` : "Pick a hospital"}
                  </button>
                  <button onClick={() => setAction(null)} disabled={submitting}
                    className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-100 transition">
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Referrals tab ───────────────────────────────────────────────────────────
const FILTERS = [
  { key: "",         label: "All" },
  { key: "pending",  label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
] as const;

export function ReferralsTab({
  hospitalId, onCountsChange,
}: {
  hospitalId: string;
  onCountsChange: () => void;
}) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Referral | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await fetch(`/api/hospital/referrals?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load referrals.");
        return;
      }
      setReferrals(data.referrals ?? []);
    } catch {
      toast.error("Network error loading referrals.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated() {
    load(true);
    onCountsChange();
  }

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-full transition shadow-sm ${
                active ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
              }`}>
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, patient or doctor…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition shadow-sm"
        />
      </div>

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
      {!loading && referrals.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
          <Inbox className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">
            {debouncedSearch ? "No referrals match your search" : statusFilter ? `No ${statusFilter} referrals` : "No referrals yet"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {debouncedSearch || statusFilter
              ? "Try a different filter or search term."
              : "Referrals sent to your hospital from poveon.com will appear here."}
          </p>
        </div>
      )}

      {/* List */}
      {!loading && referrals.map((r) => {
        const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending;
        return (
          <button key={r.id} onClick={() => setSelected(r)}
            className="w-full text-left bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-4 flex items-start gap-3 hover:bg-slate-50/60 hover:border-slate-200 transition">
            <div className="w-10 h-10 rounded-xl bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0 mt-0.5">
              <User className="w-5 h-5 text-medical-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">{r.code}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                  {badge.icon}{badge.label}
                </span>
                <UrgencyBadge urgency={r.urgency} />
              </div>
              <p className="text-sm font-bold text-slate-800 mt-1 truncate">
                {r.patient_name}
                {patientSummary(r) && <span className="font-normal text-slate-400"> · {patientSummary(r)}</span>}
              </p>
              {r.specialty && (
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 truncate">
                  <Stethoscope className="w-3 h-3 text-medical-400 shrink-0" />{r.specialty}
                </p>
              )}
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {r.doctor_name ?? "Unknown doctor"}
                {r.from_hospital ? ` — ${r.from_hospital}` : ""}
                <span className="text-slate-300"> · </span>
                {timeAgo(r.created_at)}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
          </button>
        );
      })}

      {/* Detail modal */}
      {selected && (
        <ReferralDetail
          referral={selected}
          hospitalId={hospitalId}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
