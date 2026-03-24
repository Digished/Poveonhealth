"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical, LogOut, Building2, User,
  CalendarDays, TestTube2, ChevronDown, ChevronUp,
  Clock, CheckCircle, Eye, MapPin, Phone, X, Shield, EyeOff, RefreshCw, MessageCircle, Star, MessageSquare, ExternalLink,
  Stethoscope, Pencil, Check, CreditCard, ChevronRight, Info,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { PhoneInput } from "@/components/PhoneInput";
import { BankAccountInput } from "@/components/BankAccountInput";
import { PrefixSelect } from "@/components/PrefixSelect";

interface Lab {
  id: string;
  name: string;
  address: string;
  phones: string[];
  logo_url: string | null;
  whatsapp?: string | null;
}

interface Request {
  id: string;
  code: string;
  patient_name: string | null;
  dob: string | null;
  sex: string | null;
  address: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  doctor_prefix: string | null;
  doctor_name: string;
  doctor_phone: string | null;
  doctor_hospital: string | null;
  doctor_bank_name: string | null;
  doctor_account_number: string | null;
  doctor_account_name: string | null;
  tests: string;
  test_image_url: string | null;
  diagnosis: string | null;
  schedule: string | null;
  status: string;
  result_link: string | null;
  result_note: string | null;
  result_file_urls: string[];
  created_at: string;
  seen_at: string | null;
  completed_at: string | null;
  lab: Lab;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  incoming: {
    label: "Pending",
    color: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  seen: {
    label: "Patient Arrived",
    color: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: <Eye className="w-3.5 h-3.5" />,
  },
  done: {
    label: "Completed",
    color: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
};

const SCHEDULE_LABELS: Record<string, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  not_sure: "Not Sure",
};


function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatDob(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function RequestCard({ req }: { req: Request }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.incoming;
  const phones = Array.isArray(req.lab.phones) ? req.lab.phones : [];
  const whatsapps: string[] = req.lab.whatsapp
    ? (() => { try { const p = JSON.parse(req.lab.whatsapp!); return Array.isArray(p) ? p.filter(Boolean) : [req.lab.whatsapp!]; } catch { return [req.lab.whatsapp!]; } })()
    : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-slate-50/60 transition"
      >
        {/* Lab logo / icon */}
        <div className="shrink-0 mt-0.5">
          {req.lab.logo_url ? (
            <img src={req.lab.logo_url} alt={req.lab.name} className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-100" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-medical-50 border border-medical-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-medical-500" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">{req.code}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${status.color}`}>
              {status.icon}{status.label}
            </span>
          </div>
          <p className="text-sm font-bold text-slate-800 mt-0.5 truncate">{req.lab.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <User className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 truncate">{req.patient_name ?? "—"}</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-400">{formatDate(req.created_at)}</span>
          </div>
        </div>

        <div className="shrink-0 text-slate-400 mt-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/40">
          {/* Patient details */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Patient</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Name</span>
                <span className="text-slate-700 font-medium">{req.patient_name ?? "—"}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Date of Birth</span>
                <span className="text-slate-700 font-medium">{formatDob(req.dob)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-slate-400 w-24 shrink-0">Sex</span>
                <span className="text-slate-700 font-medium capitalize">{req.sex ?? "—"}</span>
              </div>
              {req.patient_phone && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Phone</span>
                  <a href={`tel:${req.patient_phone}`} className="text-medical-600 font-medium">{req.patient_phone}</a>
                </div>
              )}
              {req.patient_email && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Email</span>
                  <span className="text-slate-700 font-medium break-all">{req.patient_email}</span>
                </div>
              )}
              {req.address && (
                <div className="flex gap-2">
                  <span className="text-slate-400 w-24 shrink-0">Address</span>
                  <span className="text-slate-700 font-medium">{req.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tests */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Tests Requested</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{req.tests}</p>
          </div>

          {req.diagnosis && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Diagnosis / Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed">{req.diagnosis}</p>
            </div>
          )}

          {/* Schedule */}
          {req.schedule && (
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-medical-500" />
              <span className="text-xs text-slate-500">Preferred schedule:</span>
              <span className="text-xs font-semibold text-slate-700">{SCHEDULE_LABELS[req.schedule] ?? req.schedule}</span>
            </div>
          )}

          {/* Lab details */}
          <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Laboratory</p>
            <p className="text-sm font-bold text-slate-800">{req.lab.name}</p>
            {req.lab.address && (
              <div className="flex items-start gap-1.5 text-xs text-slate-500">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />{req.lab.address}
              </div>
            )}
            {phones.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <Phone className="w-3 h-3 shrink-0" />
                {phones.map((p, i) => (
                  <a key={i} href={`tel:${p}`} className="text-medical-600 font-medium">{p}</a>
                ))}
              </div>
            )}
            {whatsapps.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {whatsapps.map((wa, i) => (
                  <a key={i} href={`https://wa.me/${wa.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 transition px-2.5 py-1 rounded-full">
                    <MessageCircle className="w-3 h-3" />WhatsApp
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Results — shown when lab has sent results */}
          {req.status === "done" && (req.result_link || req.result_note || req.result_file_urls?.length > 0) && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />Results Available
              </p>
              {req.result_note && <p className="text-sm text-emerald-800 leading-relaxed">{req.result_note}</p>}
              {req.result_link && (
                <a href={req.result_link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2 transition">
                  View Results Online →
                </a>
              )}
              {req.result_file_urls?.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition w-fit">
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  {req.result_file_urls.length > 1 ? `Result File ${i + 1}` : "Download Result File"}
                </a>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Timeline</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-slate-500">
                <Clock className="w-3 h-3 text-slate-300 shrink-0" />
                <span>Submitted:</span>
                <span className="text-slate-700 font-medium">{formatDate(req.created_at)}</span>
              </div>
              {req.seen_at && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Eye className="w-3 h-3 text-blue-400 shrink-0" />
                  <span>Patient arrived:</span>
                  <span className="text-slate-700 font-medium">{formatDate(req.seen_at)}</span>
                </div>
              )}
              {req.completed_at && (
                <div className="flex items-center gap-2 text-slate-500">
                  <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Tests completed:</span>
                  <span className="text-slate-700 font-medium">{formatDate(req.completed_at)}</span>
                </div>
              )}
            </div>
          </div>

          <DocFeedbackWidget labId={req.lab.id} labName={req.lab.name} />
        </div>
      )}
    </div>
  );
}

// ─── Doc Feedback Widget ──────────────────────────────────────────────────────
function DocStarRow({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => onChange?.(s)} className="hover:scale-110 transition">
          <Star className={`w-5 h-5 ${s <= value ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-100"} transition`} />
        </button>
      ))}
    </div>
  );
}

const DOC_RATING_ASPECTS = [
  { key: "rating_accuracy",    label: "Test Accuracy" },
  { key: "rating_speed",       label: "Speed / Turnaround" },
  { key: "rating_staff",       label: "Staff & Professionalism" },
  { key: "rating_environment", label: "Cleanliness & Environment" },
] as const;

type DocFeedbackForm = {
  rating_overall: number; rating_accuracy: number; rating_speed: number;
  rating_staff: number; rating_environment: number;
  comment: string; is_anonymous: boolean; display_name: string;
};

function DocFeedbackWidget({ labId, labName }: { labId: string; labName: string }) {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<DocFeedbackForm | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [form, setForm] = useState<DocFeedbackForm>({
    rating_overall: 0, rating_accuracy: 0, rating_speed: 0,
    rating_staff: 0, rating_environment: 0,
    comment: "", is_anonymous: false, display_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function loadExisting() {
    setLoadingExisting(true);
    fetch(`/api/feedback/${labId}`, { method: "PATCH" })
      .then((r) => r.json())
      .then((d) => {
        if (d.feedback) {
          const fb = d.feedback;
          const f: DocFeedbackForm = {
            rating_overall: fb.rating_overall ?? 0,
            rating_accuracy: fb.rating_accuracy ?? 0,
            rating_speed: fb.rating_speed ?? 0,
            rating_staff: fb.rating_staff ?? 0,
            rating_environment: fb.rating_environment ?? 0,
            comment: fb.comment ?? "",
            is_anonymous: fb.is_anonymous ?? false,
            display_name: fb.display_name ?? "",
          };
          setExisting(f); setForm(f);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }

  function toggle() {
    if (!open && existing === null && !loadingExisting) loadExisting();
    setOpen((v) => !v); setSaved(false); setError("");
  }

  async function submit() {
    if (form.rating_overall === 0) { setError("Please give an overall rating."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/feedback/${labId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          rating_accuracy: form.rating_accuracy || null,
          rating_speed: form.rating_speed || null,
          rating_staff: form.rating_staff || null,
          rating_environment: form.rating_environment || null,
          display_name: form.display_name.trim() || null,
          comment: form.comment.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed."); return; }
      setExisting(form); setSaved(true); setOpen(false);
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  const hasRated = existing !== null && existing.rating_overall > 0;

  return (
    <div>
      <button onClick={toggle}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors ${
          hasRated
            ? "bg-amber-50 border-amber-200 hover:bg-amber-100"
            : "bg-sky-50 border-sky-200 hover:bg-sky-100"
        }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${hasRated ? "bg-amber-100" : "bg-sky-100"}`}>
            <Star className={`w-4 h-4 ${hasRated ? "fill-amber-500 text-amber-500" : "text-sky-500"}`} />
          </div>
          <div className="text-left">
            <p className={`text-xs font-bold ${hasRated ? "text-amber-700" : "text-sky-700"}`}>
              {saved ? "Rating saved!" : hasRated ? "Your rating" : `Rate ${labName}`}
            </p>
            {hasRated && !open ? (
              <div className="flex gap-0.5 mt-0.5">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} className={`w-3 h-3 ${s <= existing.rating_overall ? "fill-amber-400 text-amber-400" : "text-amber-200 fill-amber-50"}`} />
                ))}
              </div>
            ) : (
              <p className={`text-xs ${hasRated ? "text-amber-500" : "text-sky-500"}`}>
                {hasRated ? `${existing.rating_overall}/5 · tap to update` : "Share your experience with this lab"}
              </p>
            )}
          </div>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {loadingExisting ? (
            <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 text-slate-300 animate-spin" /></div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Overall Experience <span className="text-red-400">*</span></p>
                <DocStarRow value={form.rating_overall} onChange={(v) => setForm((f) => ({ ...f, rating_overall: v }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DOC_RATING_ASPECTS.map(({ key, label }) => (
                  <div key={key}>
                    <p className="text-xs text-slate-500 mb-1.5">{label}</p>
                    <DocStarRow value={form[key]} onChange={(v) => setForm((f) => ({ ...f, [key]: v }))} />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                  <MessageSquare className="w-3 h-3 inline mr-1" />Comment (optional)
                </label>
                <textarea rows={2} maxLength={500}
                  value={form.comment}
                  onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                  placeholder="Share your experience…"
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-medical-400 bg-white resize-none"
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <button type="button" onClick={() => setForm((f) => ({ ...f, is_anonymous: !f.is_anonymous }))}
                  className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border transition ${
                    form.is_anonymous ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}>
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${form.is_anonymous ? "border-white" : "border-slate-400"}`}>
                    {form.is_anonymous && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  Stay anonymous
                </button>
                {!form.is_anonymous && (
                  <input type="text" maxLength={60}
                    value={form.display_name}
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder="Your name (optional)"
                    className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-medical-400 bg-white"
                  />
                )}
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
              <div className="flex gap-2">
                <button onClick={submit} disabled={saving || form.rating_overall === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-500 text-white text-sm font-semibold hover:bg-medical-600 transition disabled:opacity-50">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                  {saving ? "Saving…" : hasRated ? "Update Rating" : "Submit Rating"}
                </button>
                <button onClick={() => setOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface DoctorProfileData {
  prefix: string | null;
  full_name: string | null;
  phone: string | null;
  hospital: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
}

function DocDashboardInner() {
  const router = useRouter();

  const [doctorEmail, setDoctorEmail] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [profile, setProfile] = useState<DoctorProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "incoming" | "seen" | "done">("all");
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<"requests" | "results" | "profile" | "security">("requests");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/doc-login/me");
      if (res.status === 401) { router.replace("/doc-login"); return; }
      const data = await res.json();
      if (!data.success) { setError(data.error ?? "Failed to load."); return; }
      setDoctorEmail(data.doctor_email);
      setRequests(data.requests);
      setProfile(data.profile ?? null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/doc-login/logout", { method: "POST" });
    router.replace("/doc-login");
  }

  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const counts = {
    all: requests.length,
    incoming: requests.filter((r) => r.status === "incoming").length,
    seen: requests.filter((r) => r.status === "seen").length,
    done: requests.filter((r) => r.status === "done").length,
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-white/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center shadow-sm shrink-0">
            <FlaskConical className="w-4 h-4 text-sky-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight">Doctor Portal</p>
            {doctorEmail && <p className="text-xs text-slate-400 truncate">{doctorEmail}</p>}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50 transition px-3 py-1.5 rounded-lg hover:bg-red-50 shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{loggingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Tab Navigation */}
        {!loading && (
          <div className="flex gap-1 bg-white/60 rounded-xl p-1 border border-white/60 shadow-sm">
            {(["requests", "results", "profile", "security"] as const).map((tab) => {
              const labels = { requests: "Referrals", results: "Results", profile: "Profile", security: "Security" };
              const resultCount = requests.filter((r) => r.status === "done").length;
              const tabCount = tab === "requests" ? requests.length : tab === "results" ? resultCount : 0;
              const profileIncomplete = tab === "profile" && !profile?.full_name;
              return (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 relative flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {tab === "requests" && <FlaskConical className="w-3 h-3" />}
                  {tab === "results" && <CheckCircle className="w-3 h-3" />}
                  {tab === "profile" && <User className="w-3 h-3" />}
                  {tab === "security" && <Shield className="w-3 h-3" />}
                  <span className="hidden sm:inline">{labels[tab]}</span>
                  <span className="sm:hidden">{tab === "requests" ? "Refs" : tab === "results" ? "Done" : tab === "profile" ? "Me" : "Pin"}</span>
                  {tabCount > 0 && (
                    <span className={`text-xs px-1 py-0.5 rounded-full font-bold ${
                      activeTab === tab ? "bg-slate-100 text-slate-600" : "bg-slate-200/60 text-slate-500"
                    }`}>{tabCount}</span>
                  )}
                  {profileIncomplete && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full border border-white" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Security Tab */}
        {!loading && activeTab === "security" && doctorEmail && (
          <DocSecuritySection email={doctorEmail} />
        )}

        {/* Profile Tab */}
        {!loading && activeTab === "profile" && doctorEmail && (
          <DocProfileSection
            email={doctorEmail}
            initialProfile={profile}
            onProfileUpdate={(updated) => setProfile(updated)}
          />
        )}

        {/* Results Tab */}
        {!loading && activeTab === "results" && (
          <div className="space-y-4">
            {requests.filter((r) => r.status === "done").length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
                <CheckCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">No completed tests yet</p>
                <p className="text-xs text-slate-400 mt-1">Tests marked as done by the lab will appear here.</p>
              </div>
            ) : (
              requests.filter((r) => r.status === "done").map((req) => (
                <div key={req.id} className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {req.lab.logo_url ? (
                      <img src={req.lab.logo_url} alt={req.lab.name} className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-100" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-medical-50 border border-medical-100 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-medical-500" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-slate-800">{req.lab.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{req.code}</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">Patient: <span className="font-medium text-slate-700">{req.patient_name ?? "—"}</span></p>
                  {(req.result_link || req.result_note || req.result_file_urls?.length > 0) ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />Results Available
                      </p>
                      {req.result_note && <p className="text-sm text-emerald-800">{req.result_note}</p>}
                      {req.result_link && (
                        <a href={req.result_link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition">
                          View Results Online
                        </a>
                      )}
                      {req.result_file_urls?.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition w-fit">
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          {req.result_file_urls.length > 1 ? `Result File ${i + 1}` : "Download Result File"}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      <p className="text-xs text-slate-500 italic">Awaiting digital results from the lab</p>
                    </div>
                  )}
                  <DocFeedbackWidget labId={req.lab.id} labName={req.lab.name} />
                </div>
              ))
            )}
          </div>
        )}

        {/* Requests Tab — summary chips + list */}
        {activeTab === "requests" && (
          <>
        {/* Summary chips */}
        <div className="flex gap-2 flex-wrap">
          {(["all", "incoming", "seen", "done"] as const).map((s) => {
            const labels = { all: "All", incoming: "Pending", seen: "Arrived", done: "Completed" };
            const colors = {
              all: filter === "all" ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-200",
              incoming: filter === "incoming" ? "bg-amber-500 text-white" : "bg-white text-amber-700 border border-amber-200",
              seen: filter === "seen" ? "bg-blue-500 text-white" : "bg-white text-blue-700 border border-blue-200",
              done: filter === "done" ? "bg-emerald-500 text-white" : "bg-white text-emerald-700 border border-emerald-200",
            };
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition shadow-sm ${colors[s]}`}
              >
                {labels[s]}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${filter === s ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* Loading skeleton */}
        {loading && !requests.length && (
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
            <TestTube2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">
              {filter === "all" ? "No requests found" : `No ${filter} requests`}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {filter === "all"
                ? "Requests you submit will appear here."
                : "Try switching to a different filter above."}
            </p>
          </div>
        )}

        {/* Request list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
                <div className="flex gap-3"><div className="w-10 h-10 rounded-xl bg-slate-100" /><div className="flex-1 space-y-2"><div className="h-3 bg-slate-100 rounded w-1/3" /><div className="h-4 bg-slate-100 rounded w-2/3" /></div></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <TestTube2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">{filter === "all" ? "No referrals yet" : `No ${filter} requests`}</p>
            <p className="text-xs text-slate-400 mt-1">{filter === "all" ? "Requests you submit will appear here." : "Try switching to a different filter."}</p>
          </div>
        ) : (
          filtered.map((req) => <RequestCard key={req.id} req={req} />)
        )}
          </>
        )}
      </main>

      {/* Footer */}
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <PoveonLogo className="w-4 h-4 opacity-40" />
        <span>© {new Date().getFullYear()} Poveon. All rights reserved.</span>
      </div>
    </div>
  );
}

function DocSecuritySection({ email }: { email: string }) {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  type SecStage = "idle" | "pre_send" | "verify" | "form";
  const [stage, setStage] = useState<SecStage>("idle");
  const [mode, setMode] = useState<"set" | "change" | "remove">("set");
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpError, setOtpError] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/doc-login/check-pin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).then((r) => r.json()).then((d) => setHasPin(!!d.hasPin)).catch(() => setHasPin(false));
  }, [email]);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  function startAction(m: "set" | "change" | "remove") {
    setMode(m); setStage("pre_send"); setOtpCode(""); setOtpError(""); setSuccess("");
  }

  async function sendOtp() {
    setOtpSending(true); setOtpError("");
    try {
      const res = await fetch("/api/doc-login/send-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Failed to send code."); return; }
      setStage("verify"); setOtpCountdown(60); setOtpCode("");
    } catch { setOtpError("Network error."); }
    finally { setOtpSending(false); }
  }

  async function verifyOtp() {
    if (otpCode.replace(/\D/g, "").length < 6) { setOtpError("Enter the full 6-digit code."); return; }
    setOtpVerifying(true); setOtpError("");
    try {
      const res = await fetch("/api/doc-login/check-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.error ?? "Invalid code."); return; }
      setStage("form"); setPin(""); setConfirmPin(""); setFormError("");
    } catch { setOtpError("Network error."); }
    finally { setOtpVerifying(false); }
  }

  async function savePin() {
    if (mode !== "remove") {
      if (!/^\d{4}$/.test(pin)) { setFormError("PIN must be exactly 4 digits."); return; }
      if (pin !== confirmPin) { setFormError("PINs do not match."); return; }
    }
    setSaving(true); setFormError(""); setSuccess("");
    try {
      const res = await fetch("/api/doc-login/set-pin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: mode === "remove" ? "" : pin }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        setHasPin(mode !== "remove");
        setSuccess(mode === "remove" ? "PIN removed." : "PIN saved successfully.");
        setStage("idle");
      } else {
        setFormError(data.error ?? "Failed to save.");
      }
    } catch { setFormError("Network error."); }
    finally { setSaving(false); }
  }

  if (hasPin === null) return null;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm overflow-hidden">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-medical-500" />
          <h2 className="text-sm font-bold text-slate-800">Security</h2>
        </div>

        {success && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
            {success}
          </p>
        )}

        {stage === "idle" && (
          <>
            <p className="text-xs text-slate-500">
              {hasPin ? "4-digit PIN active — used for quick sign-in." : "Set a PIN for faster login — no email code needed each time."}
            </p>
            <div className="flex flex-wrap gap-2">
              {!hasPin && (
                <button onClick={() => startAction("set")}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-medical-500 text-white hover:bg-medical-600 transition">
                  <Shield className="w-3.5 h-3.5" />Set up PIN
                </button>
              )}
              {hasPin && (
                <>
                  <button onClick={() => startAction("change")}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-medical-50 text-medical-700 border border-medical-100 hover:bg-medical-100 transition">
                    <Shield className="w-3.5 h-3.5" />Change PIN
                  </button>
                  <button onClick={() => startAction("remove")}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition">
                    <X className="w-3.5 h-3.5" />Remove PIN
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {stage === "pre_send" && (
          <div className="space-y-3">
            <div className="bg-medical-50 border border-medical-100 rounded-xl px-3 py-3">
              <p className="text-xs font-semibold text-medical-700 mb-1">Identity Verification Required</p>
              <p className="text-xs text-medical-600">We&apos;ll send a 6-digit code to <span className="font-semibold">{email}</span>.</p>
            </div>
            {otpError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{otpError}</p>}
            <div className="flex gap-2">
              <button onClick={sendOtp} disabled={otpSending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-500 text-white text-sm font-semibold hover:bg-medical-600 transition disabled:opacity-50">
                {otpSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {otpSending ? "Sending…" : "Send Code"}
              </button>
              <button onClick={() => setStage("idle")}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage === "verify" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Enter the 6-digit code sent to <span className="font-semibold text-slate-700">{email}</span></p>
            <input
              type="text" inputMode="numeric" maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full text-center text-xl font-bold tracking-[0.4em] px-3 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-medical-400 bg-white"
            />
            {otpError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{otpError}</p>}
            <div className="flex gap-2">
              <button onClick={verifyOtp} disabled={otpVerifying || otpCode.length < 6}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-medical-500 text-white text-sm font-semibold hover:bg-medical-600 transition disabled:opacity-50">
                {otpVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {otpVerifying ? "Verifying…" : "Verify"}
              </button>
              <button onClick={() => setStage("idle")}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition">
                Cancel
              </button>
            </div>
            {otpCountdown > 0 ? (
              <p className="text-xs text-slate-400 text-center">Resend in {otpCountdown}s</p>
            ) : (
              <button onClick={sendOtp} disabled={otpSending}
                className="w-full text-xs text-medical-600 hover:text-medical-700 font-medium text-center py-1">
                {otpSending ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>
        )}

        {stage === "form" && (
          <div className="space-y-3">
            {mode === "remove" ? (
              <p className="text-sm text-slate-600">Remove your login PIN? You&apos;ll need an email code each time.</p>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                    {mode === "change" ? "New PIN" : "Create a 4-digit PIN"}
                  </label>
                  <div className="relative">
                    <input type={showPin ? "text" : "password"} inputMode="numeric" maxLength={4}
                      value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="••••"
                      className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-medical-400 bg-white pr-10 tracking-[0.5em]"
                    />
                    <button type="button" onClick={() => setShowPin((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Confirm PIN</label>
                  <input type={showPin ? "text" : "password"} inputMode="numeric" maxLength={4}
                    value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-medical-400 bg-white tracking-[0.5em]"
                  />
                </div>
              </>
            )}
            {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{formError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={savePin} disabled={saving}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                  mode === "remove" ? "bg-red-500 text-white hover:bg-red-600" : "bg-medical-500 text-white hover:bg-medical-600"
                }`}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Saving…" : mode === "remove" ? "Remove PIN" : "Save PIN"}
              </button>
              <button onClick={() => setStage("idle")}
                className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Doctor Profile Section ───────────────────────────────────────────────────

type OnboardStep = 1 | 2 | 3;

function DocProfileSection({
  email,
  initialProfile,
  onProfileUpdate,
}: {
  email: string;
  initialProfile: DoctorProfileData | null;
  onProfileUpdate: (p: DoctorProfileData) => void;
}) {
  const [profile, setProfile] = useState<DoctorProfileData>(
    initialProfile ?? { prefix: null, full_name: null, phone: null, hospital: null, bank_name: null, account_number: null, account_name: null }
  );
  const [onboardStep, setOnboardStep] = useState<OnboardStep>(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  // Editing states per section
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [editingHospital, setEditingHospital] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  // Local form values
  const [localPrefix, setLocalPrefix] = useState(profile.prefix ?? "");
  const [localName, setLocalName] = useState(profile.full_name ?? "");
  const [localPhone, setLocalPhone] = useState(profile.phone ?? "");
  const [localHospital, setLocalHospital] = useState(profile.hospital ?? "");
  const [localBankName, setLocalBankName] = useState(profile.bank_name ?? "");
  const [localBankCode, setLocalBankCode] = useState("");
  const [localAccountNumber, setLocalAccountNumber] = useState(profile.account_number ?? "");
  const [localAccountName, setLocalAccountName] = useState(profile.account_name ?? "");
  const [bankVerified, setBankVerified] = useState(!!(profile.bank_name && profile.account_number && profile.account_name));
  const [bankSkipped, setBankSkipped] = useState(false);

  const isOnboarding = !profile.full_name;

  async function saveFields(fields: Partial<DoctorProfileData>) {
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const res = await fetch("/api/doc-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error ?? "Failed to save."); return false; }
      const updated = { ...profile, ...data.profile };
      setProfile(updated);
      onProfileUpdate(updated);
      setSaveSuccess("Saved!");
      setTimeout(() => setSaveSuccess(""), 2500);
      return true;
    } catch {
      setSaveError("Network error. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function savePersonal() {
    const ok = await saveFields({ prefix: localPrefix || null, full_name: localName || null, phone: localPhone || null });
    if (ok) {
      setEditingPersonal(false);
      if (isOnboarding) setOnboardStep(2);
    }
  }

  async function saveHospital() {
    const ok = await saveFields({ hospital: localHospital || null });
    if (ok) {
      setEditingHospital(false);
      if (isOnboarding) setOnboardStep(3);
    }
  }

  async function saveBank() {
    if (!bankVerified) { setSaveError("Please verify your bank account first."); return; }
    const ok = await saveFields({ bank_name: localBankName || null, account_number: localAccountNumber || null, account_name: localAccountName || null });
    if (ok) setEditingBank(false);
  }

  // Onboarding progress
  const step1Done = !!(profile.full_name);
  const step2Done = !!(profile.hospital);
  const step3Done = !!(profile.bank_name && profile.account_number);
  const allDone = step1Done && step2Done && step3Done;

  if (isOnboarding) {
    // ── Onboarding Wizard ──────────────────────────────────────────────
    return (
      <div className="space-y-4">
        {/* Progress */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-xl bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-medical-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Set up your profile</p>
              <p className="text-xs text-slate-400">Helps labs and admins know who you are</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map((s) => {
              const done = s === 1 ? step1Done : s === 2 ? step2Done : step3Done;
              const active = onboardStep === s && !done;
              return (
                <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${done ? "bg-emerald-400" : active ? "bg-medical-400" : "bg-slate-200"}`} />
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-slate-400">Your details</span>
            <span className="text-xs text-slate-400">Hospital</span>
            <span className="text-xs text-slate-400">Bank (optional)</span>
          </div>
        </div>

        {/* Step 1: Personal details */}
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${step1Done ? "border-emerald-200" : onboardStep === 1 ? "border-medical-200" : "border-slate-100"}`}>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${step1Done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-medical-400 text-medical-600"}`}>
              {step1Done ? <Check className="w-3.5 h-3.5" /> : "1"}
            </div>
            <p className="text-sm font-semibold text-slate-700 flex-1">Your name &amp; contact</p>
            {step1Done && !editingPersonal && (
              <button onClick={() => setEditingPersonal(true)} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>

          {(onboardStep === 1 || editingPersonal) && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
              {/* Prefix */}
              <PrefixSelect value={localPrefix} onChange={setLocalPrefix} />
              {/* Full Name */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Firstname Lastname"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition"
                />
              </div>
              {/* Phone */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Phone Number</label>
                <PhoneInput value={localPhone} onChange={setLocalPhone} />
              </div>
              {saveError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>}
              <button
                onClick={savePersonal}
                disabled={saving || !localName.trim() || !localPrefix}
                className="w-full py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {saving ? "Saving…" : "Save & Continue"}
              </button>
            </div>
          )}
          {step1Done && !editingPersonal && (
            <div className="px-4 pb-3 text-xs text-slate-600 space-y-1 border-t border-slate-50 pt-2">
              <p><span className="text-slate-400">Name:</span> {[profile.prefix, profile.full_name].filter(Boolean).join(" ")}</p>
              {profile.phone && <p><span className="text-slate-400">Phone:</span> {profile.phone}</p>}
            </div>
          )}
        </div>

        {/* Step 2: Hospital */}
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${step2Done ? "border-emerald-200" : onboardStep === 2 ? "border-medical-200" : "border-slate-100 opacity-60"}`}>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${step2Done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-medical-400 text-medical-600"}`}>
              {step2Done ? <Check className="w-3.5 h-3.5" /> : "2"}
            </div>
            <p className="text-sm font-semibold text-slate-700 flex-1">Hospital or Clinic</p>
            {step2Done && !editingHospital && (
              <button onClick={() => setEditingHospital(true)} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>

          {onboardStep >= 2 && (onboardStep === 2 || editingHospital) && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Hospital / Clinic Name</label>
                <input
                  type="text"
                  placeholder="e.g. Lagos University Teaching Hospital"
                  value={localHospital}
                  onChange={(e) => setLocalHospital(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition"
                />
                <p className="text-xs text-slate-400 mt-1">Type &apos;private&apos; if not affiliated with any institution</p>
              </div>
              {saveError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>}
              <button
                onClick={saveHospital}
                disabled={saving || !localHospital.trim()}
                className="w-full py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {saving ? "Saving…" : "Save & Continue"}
              </button>
            </div>
          )}
          {step2Done && !editingHospital && (
            <div className="px-4 pb-3 text-xs text-slate-600 border-t border-slate-50 pt-2">
              <span className="text-slate-400">Hospital:</span> {profile.hospital}
            </div>
          )}
        </div>

        {/* Step 3: Bank Details (optional) */}
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${step3Done ? "border-emerald-200" : onboardStep === 3 ? "border-amber-200" : "border-slate-100 opacity-60"}`}>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${step3Done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-amber-400 text-amber-600"}`}>
              {step3Done ? <Check className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700">Bank Details <span className="text-xs font-normal text-slate-400">(optional)</span></p>
              <p className="text-xs text-slate-400">For referral commission payments</p>
            </div>
            {step3Done && !editingBank && (
              <button onClick={() => setEditingBank(true)} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors shrink-0">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>

          {onboardStep >= 3 && !bankSkipped && (onboardStep === 3 || editingBank) && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
              <BankAccountInput
                bankName={localBankName}
                bankCode={localBankCode}
                accountNumber={localAccountNumber}
                accountName={localAccountName}
                onBankChange={(name, code) => { setLocalBankName(name); setLocalBankCode(code); setBankVerified(false); }}
                onAccountNumberChange={(v) => { setLocalAccountNumber(v); setBankVerified(false); }}
                onAccountNameChange={setLocalAccountName}
                onVerifiedChange={setBankVerified}
              />
              {saveError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>}
              {saveSuccess && <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{saveSuccess}</p>}
              <div className="flex gap-2">
                <button
                  onClick={saveBank}
                  disabled={saving || !bankVerified}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? "Saving…" : "Save Bank Details"}
                </button>
                <button
                  onClick={() => setBankSkipped(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition"
                >
                  Skip
                </button>
              </div>
            </div>
          )}
          {onboardStep >= 3 && bankSkipped && !step3Done && (
            <div className="px-4 pb-3 flex items-center justify-between border-t border-slate-50 pt-2.5">
              <p className="text-xs text-slate-400">Bank details skipped</p>
              <button onClick={() => setBankSkipped(false)} className="text-xs text-medical-600 underline underline-offset-2 font-medium transition-colors">Add later</button>
            </div>
          )}
          {step3Done && !editingBank && (
            <div className="px-4 pb-3 text-xs text-slate-600 space-y-0.5 border-t border-slate-50 pt-2">
              <p><span className="text-slate-400">Bank:</span> {profile.bank_name}</p>
              <p><span className="text-slate-400">Account:</span> {profile.account_number} · {profile.account_name}</p>
            </div>
          )}
        </div>

        {allDone && (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Profile complete!</p>
              <p className="text-xs text-emerald-700">Your details will be auto-filled on all future requests.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Completed Profile View ─────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {saveSuccess && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-semibold text-emerald-700">{saveSuccess}</p>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl">
          <X className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs font-semibold text-red-600">{saveError}</p>
        </div>
      )}

      {/* Personal Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100">
          <User className="w-4 h-4 text-medical-600 shrink-0" />
          <p className="text-sm font-bold text-slate-800 flex-1">Personal Details</p>
          <button onClick={() => { setEditingPersonal((v) => !v); setSaveError(""); }} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors">
            {editingPersonal ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {editingPersonal ? "Cancel" : "Edit"}
          </button>
        </div>
        {!editingPersonal ? (
          <div className="px-4 py-3 space-y-1.5 text-xs text-slate-600">
            <p><span className="text-slate-400 w-16 inline-block">Name</span>{[profile.prefix, profile.full_name].filter(Boolean).join(" ") || "—"}</p>
            <p><span className="text-slate-400 w-16 inline-block">Email</span>{email}</p>
            {profile.phone && <p><span className="text-slate-400 w-16 inline-block">Phone</span>{profile.phone}</p>}
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3 space-y-3">
            <PrefixSelect value={localPrefix} onChange={setLocalPrefix} />
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Full Name</label>
              <input type="text" value={localName} onChange={(e) => setLocalName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Phone Number</label>
              <PhoneInput value={localPhone} onChange={setLocalPhone} />
            </div>
            <button onClick={savePersonal} disabled={saving || !localName.trim()}
              className="w-full py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Hospital Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100">
          <Building2 className="w-4 h-4 text-medical-600 shrink-0" />
          <p className="text-sm font-bold text-slate-800 flex-1">Hospital or Clinic</p>
          <button onClick={() => { setEditingHospital((v) => !v); setSaveError(""); }} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors">
            {editingHospital ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {editingHospital ? "Cancel" : "Edit"}
          </button>
        </div>
        {!editingHospital ? (
          <div className="px-4 py-3 text-xs text-slate-600">
            <span className="text-slate-400 w-16 inline-block">Hospital</span>{profile.hospital || "—"}
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3 space-y-3">
            <input type="text" value={localHospital} onChange={(e) => setLocalHospital(e.target.value)}
              placeholder="e.g. Lagos University Teaching Hospital"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition" />
            <button onClick={saveHospital} disabled={saving || !localHospital.trim()}
              className="w-full py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Bank Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100">
          <CreditCard className="w-4 h-4 text-medical-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Bank Details <span className="text-xs font-normal text-slate-400">(optional)</span></p>
            <p className="text-xs text-slate-400">For referral commission payments</p>
          </div>
          <button onClick={() => { setEditingBank((v) => !v); setSaveError(""); }} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors shrink-0">
            {editingBank ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {editingBank ? "Cancel" : profile.bank_name ? "Edit" : "Add"}
          </button>
        </div>
        {!editingBank ? (
          <div className="px-4 py-3 text-xs text-slate-600 space-y-0.5">
            {profile.bank_name ? (
              <>
                <p><span className="text-slate-400 w-20 inline-block">Bank</span>{profile.bank_name}</p>
                <p><span className="text-slate-400 w-20 inline-block">Account</span>{profile.account_number}</p>
                <p><span className="text-slate-400 w-20 inline-block">Name</span>{profile.account_name}</p>
              </>
            ) : (
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-400 italic">No bank details added yet. Add them to receive commission payments.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3 space-y-3">
            <BankAccountInput
              bankName={localBankName}
              bankCode={localBankCode}
              accountNumber={localAccountNumber}
              accountName={localAccountName}
              onBankChange={(name, code) => { setLocalBankName(name); setLocalBankCode(code); setBankVerified(false); }}
              onAccountNumberChange={(v) => { setLocalAccountNumber(v); setBankVerified(false); }}
              onAccountNameChange={setLocalAccountName}
              onVerifiedChange={setBankVerified}
            />
            <button onClick={saveBank} disabled={saving || !bankVerified}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Bank Details"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DocDashboardPage() {
  return (
    <Suspense>
      <DocDashboardInner />
    </Suspense>
  );
}
