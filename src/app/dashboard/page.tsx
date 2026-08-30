"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { PoveonLogo } from "@/components/PoveonLogo";
import { PageLoader, SectionLoader } from "@/components/PageLoader";
/**
 * Panels the first screen never shows.
 *
 * This dashboard shipped every tab's code in one bundle, so a patient checking
 * a result waited on the pharmacy directory, the lab directory and the whole
 * enrolment form before the page became interactive. Each is now its own chunk,
 * fetched when its tab is opened.
 */
const CarePlanPanel = dynamic(
  () => import("@/components/consults/CarePlanPanel").then((m) => m.CarePlanPanel),
  { ssr: false, loading: () => <SectionLoader label="Loading your care plan…" /> }
);
const PharmacyDirectory = dynamic(
  () => import("@/components/consults/PharmacyDirectory").then((m) => m.PharmacyDirectory),
  { ssr: false, loading: () => <SectionLoader label="Loading pharmacies…" /> }
);
const LabDirectory = dynamic(
  () => import("@/components/consults/LabDirectory").then((m) => m.LabDirectory),
  { ssr: false, loading: () => <SectionLoader label="Loading laboratories…" /> }
);
const SupportFab = dynamic(() => import("@/components/SupportFab").then((m) => m.SupportFab), {
  ssr: false,
});
const PushToggle = dynamic(
  () => import("@/components/pwa/PushToggle").then((m) => m.PushToggle),
  { ssr: false }
);
const LocationPicker = dynamic(
  () => import("@/components/consults/LocationPicker").then((m) => m.LocationPicker),
  { ssr: false, loading: () => <div className="h-20 animate-pulse rounded-xl bg-slate-100" /> }
);
const CarePlanChatFab = dynamic(
  () => import("@/components/consults/CarePlanChatFab").then((m) => m.CarePlanChatFab),
  { ssr: false }
);
import {
  CarePlanPromptCard,
  CarePlanPromptModal,
  useCarePlan,
  type CarePlanSeed,
} from "@/components/consults/CarePlanPrompt";
import { PortalNav, PortalSubNav, type PortalNavSection } from "@/components/ui/PortalNav";
import { parsePhones } from "@/lib/phones";
import { PhoneInput } from "@/components/PhoneInput";
import {
  LogOut, Phone, MapPin, Calendar, Stethoscope, FlaskConical,
  ClipboardList, User, ChevronDown, ChevronUp, FileImage, ExternalLink,
  Pencil, Check, X, RefreshCw, MessageCircle, Filter, Search, UserCircle,
  BadgeCheck, Shield, EyeOff, Eye, Star, MessageSquare, HeartPulse, Menu, Pill,
} from "lucide-react";

interface Lab {
  id: string;
  name: string;
  address?: string;
  whatsapp?: string | null;
  phones?: unknown;
}

interface PatientEncounter {
  id: string;
  code: string;
  doctor_name: string;
  doctor_specialty: string | null;
  doctor_avatar: string | null;
  plan_type: string;
  status: string;
  doctor_note: string | null;
  amount_paid: number;
  image_urls: string[];
  created_at: string;
  responded_at: string | null;
}

interface PatientSubscription {
  doctor_name: string;
  doctor_specialty: string | null;
  subscription_type: string;
  expires_at: string | null;
  active: boolean;
}

interface LabRequest {
  id: string;
  code: string;
  patient_name: string | null;
  status: "incoming" | "seen" | "done";
  tests: string;
  schedule: string | null;
  diagnosis: string | null;
  test_image_url: string | null;
  result_link: string | null;
  result_note: string | null;
  result_file_urls: string[];
  created_at: string;
  seen_at: string | null;
  completed_at: string | null;
  lab: Lab;
}

interface PatientProfile {
  name: string | null;
  phone: string | null;
  dob: string | null;
  sex: string | null;
  address: string | null;
  /** Structured location, used to show the nearest partners. */
  state?: string | null;
  city?: string | null;
}

const STATUS_MAP = {
  incoming: { label: "Pending", cls: "bg-amber-100 text-amber-700 border border-amber-200" },
  seen: { label: "At Lab", cls: "bg-blue-100 text-blue-700 border border-blue-200" },
  done: { label: "Completed", cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
};

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "incoming", label: "Pending" },
  { value: "seen", label: "At Lab" },
  { value: "done", label: "Completed" },
];

const SCHEDULE_LABELS: Record<string, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  not_sure: "Not Sure",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

/** Whole-years age from an ISO dob string, or "" if not derivable. */
function ageFromDob(dob: string | null): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : "";
}

// parsePhones is imported from @/lib/phones

function parseWhatsApp(wa: string | null | undefined): string[] {
  if (!wa) return [];
  try { const p = JSON.parse(wa); return Array.isArray(p) ? p.filter(Boolean) : [wa]; } catch { return [wa]; }
}

function TestTags({ tests }: { tests: string }) {
  const list = tests.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((t, i) => (
        <span key={i} className="text-xs bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded-full">{t}</span>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-36 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-100 rounded" />
        </div>
        <div className="h-6 w-20 bg-slate-100 rounded-full" />
      </div>
      <div className="h-3 w-48 bg-slate-100 rounded mb-2" />
      <div className="h-3 w-32 bg-slate-100 rounded" />
    </div>
  );
}

function ProfilePanel({
  profile,
  email,
  onUpdated,
  onClose,
}: {
  profile: PatientProfile;
  email: string;
  onUpdated: (p: PatientProfile) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [age, setAge] = useState(ageFromDob(profile.dob ?? ""));
  const [sex, setSex] = useState(profile.sex ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [state, setState] = useState(profile.state ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const body: Record<string, string | null> = { name: name.trim() };
      if (phone.trim()) body.phone = phone.trim();
      if (age) body.age = age;
      if (sex) body.sex = sex;
      if (address.trim()) body.address = address.trim();
      // Sent even when cleared, so a member can correct a wrong state.
      body.state = state || null;
      body.city = city || null;
      const res = await fetch("/api/patient/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) { onUpdated(data.profile); onClose(); }
      else setError("Failed to save. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50 bg-gradient-to-r from-sky-50 to-indigo-50">
        <div className="flex items-center gap-2">
          <UserCircle className="w-5 h-5 text-sky-500" />
          <h2 className="font-bold text-slate-800 text-sm">Edit Your Profile</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/70 transition">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>
      <div className="px-4 sm:px-5 py-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Email</label>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
            <BadgeCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-sm text-slate-600 truncate">{email}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Email cannot be changed — it identifies your account.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
            Full Name <span className="text-red-400">*</span>
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Amara Okonkwo"
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Phone Number</label>
          <PhoneInput value={phone} onChange={setPhone} hint="Doctors can auto-fill your details when they enter this number." />
        </div>
        {/* Age and sex are clinical facts a doctor reads results against, so
            they are shown but not edited here — a member who needs one changed
            asks, and it is corrected on the record rather than silently. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Age</label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
              {age ? `${age} years` : "Not recorded"}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Sex</label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm capitalize text-slate-600">
              {sex || "Not recorded"}
            </div>
          </div>
        </div>
        <p className="-mt-1 text-[11px] text-slate-400">
          Ask your doctor or lab to correct your age or sex — results are read against them.
        </p>
        <LocationPicker
          state={state}
          city={city}
          onStateChange={setState}
          onCityChange={setCity}
          hint="We use this to show you the nearest partner pharmacies and labs."
        />

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Home Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Your residential address"
            rows={2}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-50 transition"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? "Saving…" : "Save Profile"}
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestCard({ req }: { req: LabRequest }) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS_MAP[req.status] ?? { label: req.status, cls: "bg-slate-100 text-slate-600 border border-slate-200" };
  const phones = parsePhones(req.lab.phones);
  const whatsapps = parseWhatsApp(req.lab.whatsapp);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
      <button className="w-full text-left p-4 sm:p-5" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${st.cls}`}>
                {st.label}
              </span>
              <p className="text-xs text-slate-400 font-mono">{req.code}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <p className="text-sm font-semibold text-slate-800 truncate">{req.lab.name}</p>
            </div>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />}
        </div>
        {req.lab.address && (
          <div className="flex items-start gap-1.5 mb-2">
            <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500">{req.lab.address}</p>
          </div>
        )}
        <p className="text-xs text-slate-400">{formatDate(req.created_at)}</p>
        {req.tests && req.tests !== "See attached image" && (
          <div className="mt-3"><TestTags tests={req.tests} /></div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-50 px-4 sm:px-5 pb-5 pt-4 space-y-4">
          {req.diagnosis && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Diagnosis / Notes</p>
              <div className="flex items-start gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-600">{req.diagnosis}</p>
              </div>
            </div>
          )}
          {req.schedule && SCHEDULE_LABELS[req.schedule] && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <p className="text-sm text-slate-600"><span className="font-medium">Visit: </span>{SCHEDULE_LABELS[req.schedule]}</p>
            </div>
          )}
          {req.test_image_url && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Test Request Image</p>
              <a
                href={req.test_image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-100 hover:bg-blue-100 transition text-sm font-medium text-blue-700"
              >
                <FileImage className="w-4 h-4" />
                View test request image
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              </a>
            </div>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
            <span>Submitted: {formatDate(req.created_at)}</span>
            {req.seen_at && <span>Arrived: {formatDate(req.seen_at)}</span>}
            {req.completed_at && <span>Completed: {formatDate(req.completed_at)}</span>}
          </div>
          {/* Results card */}
          {req.status === "done" && (req.result_link || req.result_note || (req.result_file_urls?.length ?? 0) > 0) && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-700 mb-1.5 flex items-center gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5" />Results Available
              </p>
              {req.result_note && (
                <p className="text-sm text-emerald-800 mb-2 leading-relaxed">{req.result_note}</p>
              )}
              {req.result_link && (
                <a href={req.result_link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition">
                  <ExternalLink className="w-3 h-3" />View Results
                </a>
              )}
              {req.result_file_urls?.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition w-fit">
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  {req.result_file_urls.length > 1 ? `Result File ${i + 1}` : "Download Result File"}
                </a>
              ))}
            </div>
          )}
          {(phones.length > 0 || whatsapps.length > 0) && (
            <div className="pt-2 border-t border-slate-50 flex flex-wrap gap-2">
              {phones.map((phone, i) => (
                <a key={i} href={`tel:${phone.number}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition px-3 py-1.5 rounded-full">
                  <Phone className="w-3 h-3" />
                  {phone.label ? `${phone.label}: ` : ""}{phone.number}
                </a>
              ))}
              {whatsapps.map((wa, i) => (
                <a key={i} href={`https://wa.me/${wa.replace(/\D/g, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 transition px-3 py-1.5 rounded-full shadow-sm">
                  <MessageCircle className="w-3 h-3" />WhatsApp Lab
                </a>
              ))}
            </div>
          )}
          <FeedbackWidget labId={req.lab.id} labName={req.lab.name} />
        </div>
      )}
    </div>
  );
}

// ─── Star Rating ─────────────────────────────────────────────────────────────
function StarRow({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" disabled={readOnly}
          onClick={() => onChange?.(s)}
          className={`transition ${readOnly ? "cursor-default" : "hover:scale-110"}`}>
          <Star className={`w-5 h-5 ${s <= value ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-100"} transition`} />
        </button>
      ))}
    </div>
  );
}

const RATING_ASPECTS = [
  { key: "rating_accuracy",    label: "Test Accuracy" },
  { key: "rating_speed",       label: "Speed / Turnaround" },
  { key: "rating_staff",       label: "Staff & Professionalism" },
  { key: "rating_environment", label: "Cleanliness & Environment" },
] as const;

type FeedbackState = {
  rating_overall: number;
  rating_accuracy: number;
  rating_speed: number;
  rating_staff: number;
  rating_environment: number;
  comment: string;
  is_anonymous: boolean;
  display_name: string;
};

function FeedbackWidget({ labId, labName }: { labId: string; labName: string }) {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<FeedbackState | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [form, setForm] = useState<FeedbackState>({
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
          const f: FeedbackState = {
            rating_overall:     fb.rating_overall     ?? 0,
            rating_accuracy:    fb.rating_accuracy    ?? 0,
            rating_speed:       fb.rating_speed       ?? 0,
            rating_staff:       fb.rating_staff       ?? 0,
            rating_environment: fb.rating_environment ?? 0,
            comment:            fb.comment            ?? "",
            is_anonymous:       fb.is_anonymous       ?? false,
            display_name:       fb.display_name       ?? "",
          };
          setExisting(f);
          setForm(f);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }

  function toggle() {
    if (!open && existing === null && !loadingExisting) loadExisting();
    setOpen((v) => !v);
    setSaved(false); setError("");
  }

  async function submit() {
    if (form.rating_overall === 0) { setError("Please give an overall rating."); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/feedback/${labId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          rating_accuracy:    form.rating_accuracy    || null,
          rating_speed:       form.rating_speed       || null,
          rating_staff:       form.rating_staff       || null,
          rating_environment: form.rating_environment || null,
          display_name:       form.display_name.trim() || null,
          comment:            form.comment.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
      setExisting(form); setSaved(true); setOpen(false);
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  const hasRated = existing !== null && (existing.rating_overall > 0);

  return (
    <div>
      {/* Prominent rating CTA */}
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
              {/* Overall */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Overall Experience <span className="text-red-400">*</span></p>
                <StarRow value={form.rating_overall} onChange={(v) => setForm((f) => ({ ...f, rating_overall: v }))} />
              </div>
              {/* Aspects */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {RATING_ASPECTS.map(({ key, label }) => (
                  <div key={key}>
                    <p className="text-xs text-slate-500 mb-1.5">{label}</p>
                    <StarRow value={form[key]} onChange={(v) => setForm((f) => ({ ...f, [key]: v }))} />
                  </div>
                ))}
              </div>
              {/* Comment */}
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                  <MessageSquare className="w-3 h-3 inline mr-1" />Comment (optional)
                </label>
                <textarea rows={2} maxLength={500}
                  value={form.comment}
                  onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                  placeholder="Share your experience…"
                  className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white resize-none"
                />
              </div>
              {/* Anonymous + display name */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                <button type="button" onClick={() => setForm((f) => ({ ...f, is_anonymous: !f.is_anonymous }))}
                  className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border transition ${
                    form.is_anonymous
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
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
                    className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  />
                )}
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
              <div className="flex gap-2">
                <button onClick={submit} disabled={saving || form.rating_overall === 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 transition disabled:opacity-50">
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

/** Compact card for the Results tab — shows a completed request with optional result link/note + rating widget */
function ResultCard({ req }: { req: LabRequest }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Lab + code */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <FlaskConical className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <p className="text-sm font-semibold text-slate-800">{req.lab.name}</p>
            </div>
            <p className="text-xs text-slate-400 font-mono">{req.code}</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 bg-emerald-100 text-emerald-700 border border-emerald-200">Done</span>
        </div>
        {req.tests && req.tests !== "See attached image" && (
          <div><TestTags tests={req.tests} /></div>
        )}
        {/* Results section */}
        {(req.result_link || req.result_note || req.result_file_urls?.length > 0) ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5" />Results Available
            </p>
            {req.result_note && (
              <p className="text-sm text-emerald-800 leading-relaxed">{req.result_note}</p>
            )}
            {req.result_link && (
              <a href={req.result_link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition">
                <ExternalLink className="w-3 h-3" />View Results Online
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
        <p className="text-xs text-slate-400">Completed: {formatDate(req.completed_at ?? req.created_at)}</p>
        {/* Prominent rating prompt */}
        <FeedbackWidget labId={req.lab.id} labName={req.lab.name} />
      </div>
    </div>
  );
}

function PatientSecuritySection({ email }: { email: string }) {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  type SecStage = "idle" | "pre_send" | "verify" | "form";
  const [stage, setStage] = useState<SecStage>("idle");
  const [mode, setMode] = useState<"set" | "change" | "remove">("set");
  // OTP
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpError, setOtpError] = useState("");
  // PIN form
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/patient/check-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then((r) => r.json())
      .then((d) => setHasPin(!!d.hasPin))
      .catch(() => setHasPin(false));
  }, []);

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
      const res = await fetch("/api/patient/send-otp", {
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
      const res = await fetch("/api/patient/check-otp", {
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
      const res = await fetch("/api/patient/set-pin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: mode === "remove" ? "" : pin }),
      });
      const data = await res.json();
      if (data.success) {
        setHasPin(mode !== "remove");
        setSuccess(mode === "remove" ? "PIN removed." : "PIN saved successfully.");
        setStage("idle");
      } else {
        setFormError(data.error ?? "Failed to save. Please try again.");
      }
    } catch { setFormError("Network error. Please try again."); }
    finally { setSaving(false); }
  }

  if (hasPin === null) return null;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm overflow-hidden">
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-sky-500" />
          <h2 className="text-sm font-bold text-slate-800">Security</h2>
        </div>

        {success && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />{success}
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
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition">
                  <Shield className="w-3.5 h-3.5" />Set up PIN
                </button>
              )}
              {hasPin && (
                <>
                  <button onClick={() => startAction("change")}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 transition">
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
            <div className="bg-sky-50 border border-sky-100 rounded-xl px-3 py-3">
              <p className="text-xs font-semibold text-sky-700 mb-1">Identity Verification Required</p>
              <p className="text-xs text-sky-600">We&apos;ll send a 6-digit code to <span className="font-semibold">{email}</span> to confirm it&apos;s you.</p>
            </div>
            {otpError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{otpError}</p>}
            <div className="flex gap-2">
              <button onClick={sendOtp} disabled={otpSending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 transition disabled:opacity-50">
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
              className="w-full text-center text-xl font-bold tracking-[0.4em] px-3 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
            />
            {otpError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{otpError}</p>}
            <div className="flex gap-2">
              <button onClick={verifyOtp} disabled={otpVerifying || otpCode.length < 6}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 transition disabled:opacity-50">
                {otpVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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
                className="w-full text-xs text-sky-600 hover:text-sky-700 font-medium text-center py-1 transition">
                {otpSending ? "Sending…" : "Resend code"}
              </button>
            )}
          </div>
        )}

        {stage === "form" && (
          <div className="space-y-3">
            {mode === "remove" ? (
              <p className="text-sm text-slate-600">Remove your login PIN? You&apos;ll need an email code each time you log in.</p>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                    {mode === "change" ? "New PIN" : "Create a 4-digit PIN"}
                  </label>
                  <div className="relative">
                    <input type={showPin ? "text" : "password"} inputMode="numeric" maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="••••"
                      className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white pr-10 tracking-[0.5em]"
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
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white tracking-[0.5em]"
                  />
                </div>
              </>
            )}
            {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{formError}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={savePin} disabled={saving}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                  mode === "remove" ? "bg-red-500 text-white hover:bg-red-600" : "bg-sky-500 text-white hover:bg-sky-600"
                }`}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
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

const PLAN_LABEL: Record<string, string> = { single: "Single visit", monthly: "Monthly retainer", yearly: "Yearly retainer" };
const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: "Received", cls: "bg-sky-50 text-sky-700 border-sky-100" },
  in_review: { label: "In review", cls: "bg-amber-50 text-amber-700 border-amber-100" },
  responded: { label: "Replied", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  closed: { label: "Closed", cls: "bg-slate-50 text-slate-500 border-slate-100" },
};

function PatientEncountersSection({
  encounters, subscriptions, onBrowse,
}: {
  encounters: PatientEncounter[];
  subscriptions: PatientSubscription[];
  onBrowse: () => void;
}) {
  const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
  const active = subscriptions.filter((s) => s.active);
  const totalPaid = encounters.reduce((sum, e) => sum + Number(e.amount_paid ?? 0), 0);
  const answered = encounters.filter((e) => !!e.doctor_note).length;

  return (
    <div className="space-y-4">
      {/* Headline numbers, laid out like the care plan's */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <VisitStat icon={Stethoscope} label="Visits" value={String(encounters.length)} accent="medical" />
        <VisitStat icon={MessageCircle} label="Doctor replies" value={String(answered)} accent="emerald" />
        <VisitStat icon={BadgeCheck} label="Memberships" value={String(active.length)} accent="indigo" />
        <VisitStat icon={ClipboardList} label="Spent" value={naira(totalPaid)} accent="slate" />
      </div>

      {active.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Your memberships</h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {active.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 px-4 py-3.5 text-white shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{s.doctor_name}</p>
                  <p className="text-[11px] text-white/80">{PLAN_LABEL[s.subscription_type] ?? "Retainer"} · active</p>
                </div>
                {s.expires_at && <p className="shrink-0 text-[11px] text-white/80">until {formatDate(s.expires_at)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {encounters.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center shadow-sm">
          <Stethoscope className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <h2 className="text-sm font-semibold text-slate-700">No doctor visits yet</h2>
          <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
            When you consult a doctor through their Poveon link, your visits and their replies appear here.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-2">
          {encounters.map((e) => (
            <div key={e.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                  {e.doctor_avatar
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={e.doctor_avatar} alt={e.doctor_name} className="h-full w-full object-cover" />
                    : <Stethoscope className="h-5 w-5 text-slate-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">{e.doctor_name}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    {e.doctor_specialty || PLAN_LABEL[e.plan_type]} · {formatDate(e.created_at)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[e.status]?.cls ?? "border-slate-100 bg-slate-50 text-slate-500"}`}>
                  {STATUS_META[e.status]?.label ?? e.status}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
                <span className="font-mono">{e.code}</span>
                <span>·</span>
                <span>{PLAN_LABEL[e.plan_type] ?? e.plan_type}</span>
                <span className="ml-auto font-semibold text-slate-600">{naira(e.amount_paid)}</span>
              </div>

              {e.doctor_note ? (
                <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                    <MessageCircle className="h-3 w-3" /> Note from your doctor
                  </p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-emerald-800">{e.doctor_note}</p>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs italic text-slate-500">Waiting on your doctor&apos;s reply</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onBrowse}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
      >
        <Stethoscope className="h-4 w-4" /> Find a doctor to consult
      </button>
    </div>
  );
}

function VisitStat({
  icon: Icon, label, value, accent,
}: {
  icon: typeof Stethoscope; label: string; value: string; accent: "medical" | "emerald" | "indigo" | "slate";
}) {
  const tones = {
    medical: "bg-medical-50 text-medical-600",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    slate: "bg-slate-100 text-slate-500",
  };
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[accent]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2.5 truncate text-xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

/** Panels the patient portal can show. */
type View =
  | "care" | "care-schedule" | "care-history" | "care-messages"
  | "pharmacies" | "labs" | "visits"
  | "tests" | "results"
  | "profile" | "security";

const VALID_VIEWS: View[] = [
  "care", "care-schedule", "care-history", "care-messages",
  "pharmacies", "labs", "visits",
  "tests", "results",
  "profile", "security",
];

/** The care plan is the portal's home — it's what a patient comes back for. */
const DEFAULT_VIEW: View = "care";

/** Grouped entries land on their parent in the sidebar and expose a sub-menu. */
const PARENT_OF: Record<View, View> = {
  care: "care",
  "care-schedule": "care",
  "care-history": "care",
  "care-messages": "care",
  pharmacies: "pharmacies",
  labs: "labs",
  visits: "visits",
  tests: "tests",
  results: "tests",
  profile: "profile",
  security: "profile",
};

const SUB_MENUS: Partial<Record<View, { key: View; label: string }[]>> = {
  // The plan, what to do about it, and the conversation — three things that
  // each deserve the whole panel rather than a third of it.
  care: [
    { key: "care", label: "My plan" },
    { key: "care-schedule", label: "Care" },
    { key: "care-history", label: "My history" },
    { key: "care-messages", label: "Messages" },
  ],
  tests: [
    { key: "tests", label: "All tests" },
    { key: "results", label: "Results" },
  ],
  profile: [
    { key: "profile", label: "My details" },
    { key: "security", label: "Security" },
  ],
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [patientEmail, setPatientEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  // Two deep links land on the care plan: `?care=1` from /consults opens the
  // enrolment form as well, `?tab=care` (the payment return) just shows it.
  const wantsCarePlan = searchParams.get("care") === "1";
  // Scanned a partner's QR poster on the way in — they start already chosen.
  const partnerFromQr = searchParams.get("pharmacy")
    ? { kind: "pharmacy" as const, code: searchParams.get("pharmacy")! }
    : searchParams.get("lab")
      ? { kind: "lab" as const, code: searchParams.get("lab")! }
      : null;
  const tabParam = searchParams.get("tab") as View | null;
  const view: View =
    wantsCarePlan ? "care"
    : tabParam && VALID_VIEWS.includes(tabParam) ? tabParam
    : DEFAULT_VIEW;
  const [navOpen, setNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showCarePrompt, setShowCarePrompt] = useState(false);
  // What the bootstrap already told us about their care plan, handed to the
  // hook so it doesn't go and ask again.
  const [careSeed, setCareSeed] = useState<CarePlanSeed | null>(null);
  const care = useCarePlan(careSeed);
  const careLoading = care.loading;

  // Stable across renders — the panels take these as props.
  const searchRef = useRef(searchParams.toString());
  searchRef.current = searchParams.toString();

  const navigate = useCallback((next: View, opts?: { enroll?: boolean }) => {
    const params = new URLSearchParams(searchRef.current);
    params.set("tab", next);
    if (opts?.enroll) params.set("care", "1");
    else params.delete("care");
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  }, [router]);
  const [encounters, setEncounters] = useState<PatientEncounter[]>([]);
  const [subscriptions, setSubscriptions] = useState<PatientSubscription[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [labFilter, setLabFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // One request for the whole first screen. This used to be three — requests,
  // profile and care plan — each its own serverless invocation repeating the
  // same session lookup before it got to the data it was for.
  const load = useCallback(() => {
    fetch("/api/patient/bootstrap", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) { router.replace("/login"); return; }
        const json = await res.json();
        if (!json.success) { router.replace("/login"); return; }
        setPatientEmail(json.patient_email);
        setRequests(json.requests ?? []);
        setProfile(json.profile ?? null);
        setCareSeed(json.care ?? null);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Doctor Visits is hidden for now, so its data is fetched only when someone
  // deep-links into that panel — one fewer request on every dashboard load.
  useEffect(() => {
    if (view !== "visits") return;
    let cancelled = false;
    fetch("/api/patient/encounters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        setEncounters(data.encounters ?? []);
        setSubscriptions(data.subscriptions ?? []);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [view]);

  // Prompt on every sign-in until they're on a live plan — but only once per
  // session, so moving around the dashboard doesn't keep reopening it.
  useEffect(() => {
    if (careLoading || care.active || !patientEmail || wantsCarePlan) return;
    try {
      const key = `poveon_care_prompt_${patientEmail}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private mode — prompt anyway, it's dismissible */ }
    setShowCarePrompt(true);
  }, [careLoading, care.active, patientEmail, wantsCarePlan]);

  async function handleLogout() {
    setLoggingOut(true);
    try { await fetch("/api/patient/logout", { method: "POST" }); } catch { /* */ }
    router.replace("/login");
  }

  const labOptions = Array.from(new Map(requests.map((r) => [r.lab.name, r.lab.name])).entries()).map(([v]) => v);

  const filtered = requests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (labFilter !== "all" && r.lab.name !== labFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.lab.name.toLowerCase().includes(q) && !r.code.toLowerCase().includes(q) && !(r.tests?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const hasActiveFilter = statusFilter !== "all" || labFilter !== "all" || !!searchQuery;
  const displayName = profile?.name || null;
  const completed = requests.filter((r) => r.status === "done");

  const parent = PARENT_OF[view];
  const subMenu = SUB_MENUS[parent] ?? [];

  const navSections: PortalNavSection[] = [
    {
      label: "My care",
      items: [
        { key: "care", label: "Care Plan", icon: HeartPulse, alert: !careLoading && !care.active },
        { key: "pharmacies", label: "Pharmacies", icon: Pill },
        { key: "labs", label: "Labs", icon: FlaskConical },
        // Doctor Visits (per-encounter consults) is hidden while the care plan
        // is the focus. The panel stays, so a deep link still reaches it.
        ...(view === "visits"
          ? [{ key: "visits", label: "Doctor Visits", icon: Stethoscope, badge: encounters.length }]
          : []),
      ],
    },
    {
      label: "Records",
      items: [{ key: "tests", label: "Lab Tests", icon: ClipboardList, badge: requests.length }],
    },
    {
      label: "Account",
      items: [{ key: "profile", label: "My Details", icon: User, alert: !loading && !displayName }],
    },
  ];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 lg:px-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 shadow-sm">
            <ClipboardList className="h-4 w-4 text-sky-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight text-slate-800">My Health</p>
            <p className="truncate text-xs text-slate-400">{displayName ?? patientEmail ?? " "}</p>
          </div>

          {/* Desktop actions */}
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>

          {/* Mobile actions */}
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setAccountMenuOpen((v) => !v)}
              aria-label="Account menu"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100"
            >
              {accountMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {accountMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAccountMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                  {patientEmail && (
                    <p className="truncate border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
                      {patientEmail}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => { setAccountMenuOpen(false); navigate("profile"); }}
                    className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 active:bg-slate-50"
                  >
                    <User className="h-4 w-4 text-slate-400" />
                    My details
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAccountMenuOpen(false); handleLogout(); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 active:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 lg:flex lg:gap-6 lg:px-6 lg:py-6">
        <PortalNav
          sections={navSections}
          activeKey={parent}
          onSelect={(key) => navigate(key as View)}
          open={navOpen}
          onOpenChange={setNavOpen}
        />

        <main className="min-w-0 flex-1 space-y-4">
          <PortalSubNav items={subMenu} activeKey={view} onSelect={(key) => navigate(key as View)} />

          {/* Where the profile card used to sit: the standing invitation, on
              every tab, until the patient is on a live plan. */}
          {!loading && !careLoading && !care.active && view !== "care" && (
            <CarePlanPromptCard
              benefits={care.benefits}
              lapsed={care.lapsed}
              onJoin={() => navigate("care")}
            />
          )}

          {loading && <SectionLoader label="Loading your dashboard…" />}

          {/* Care Plan */}
          {!loading && patientEmail && parent === "care" && (
            <CarePlanPanel
              autoOpenEnroll={wantsCarePlan}
              partnerCode={partnerFromQr}
              section={
                view === "care-schedule" ? "schedule"
                : view === "care-history" ? "history"
                : view === "care-messages" ? "messages"
                : "plan"
              }
              onChanged={care.refresh}
            />
          )}

          {/* Partner pharmacies */}
          {!loading && patientEmail && view === "pharmacies" && <PharmacyDirectory />}

          {/* Partner labs, with the member's own one marked */}
          {!loading && patientEmail && view === "labs" && (
            <LabDirectory canChoose={care.active} />
          )}

          {/* Doctor visits */}
          {!loading && patientEmail && view === "visits" && (
            <PatientEncountersSection
              encounters={encounters}
              subscriptions={subscriptions}
              onBrowse={() => router.push("/")}
            />
          )}

          {/* My details */}
          {!loading && patientEmail && view === "profile" && (
            <div className="xl:max-w-3xl">
              {editingProfile ? (
                <ProfilePanel
                  profile={profile ?? { name: null, phone: null, dob: null, sex: null, address: null }}
                  email={patientEmail}
                  onUpdated={(p) => setProfile(p)}
                  onClose={() => setEditingProfile(false)}
                />
              ) : (
                <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-500">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold leading-tight text-slate-800">
                        {displayName ?? <span className="text-sm font-normal italic text-slate-400">No name set</span>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{patientEmail}</p>
                      {(profile?.dob || profile?.sex || profile?.phone) && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                          {ageFromDob(profile.dob) && (
                            <span className="text-xs text-slate-500"><span className="text-slate-400">Age:</span> {ageFromDob(profile.dob)} yrs</span>
                          )}
                          {profile.sex && (
                            <span className="text-xs capitalize text-slate-500"><span className="text-slate-400">Sex:</span> {profile.sex}</span>
                          )}
                          {profile.phone && (
                            <span className="text-xs text-slate-500"><span className="text-slate-400">Tel:</span> {profile.phone}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setEditingProfile(true)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-100 px-2.5 py-1.5 text-xs font-semibold text-sky-600 transition hover:bg-sky-50 hover:text-sky-700"
                    >
                      <Pencil className="h-3 w-3" />Edit
                    </button>
                  </div>
                  {!displayName && (
                    <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-600">
                      Set your name so labs and doctors can identify you correctly.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Security */}
          {!loading && patientEmail && view === "security" && (
            <div className="xl:max-w-3xl space-y-4">
              <PatientSecuritySection email={patientEmail} />
              <PushToggle />
              <SupportFab variant="inline" />
            </div>
          )}

          {/* Results — completed tests only */}
          {!loading && view === "results" && (
            completed.length === 0 ? (
              <EmptyState
                icon={<BadgeCheck className="h-7 w-7 text-slate-200" />}
                title="No completed tests yet"
                hint="Tests marked as done by the lab will appear here."
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {completed.map((req) => <ResultCard key={req.id} req={req} />)}
              </div>
            )
          )}

          {/* Lab tests */}
          {view === "tests" && (
            <>
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-700">All Tests</h2>
                    <span className="rounded-full border border-slate-100 bg-white/70 px-2 py-0.5 text-xs text-slate-400">
                      {filtered.length}{filtered.length !== requests.length ? ` of ${requests.length}` : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowFilters((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      hasActiveFilter ? "border-sky-200 bg-sky-50 text-sky-700" : "border-slate-200 bg-white/70 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <Filter className="h-3 w-3" />Filter
                    {hasActiveFilter && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-sky-500" />}
                  </button>
                </div>

                {showFilters && (
                  <div ref={filterRef} className="mb-4 space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search lab name or test…"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_FILTER_OPTIONS.map((opt) => (
                          <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              statusFilter === opt.value ? "border-sky-500 bg-sky-500 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                            }`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {labOptions.length > 1 && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Lab</p>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => setLabFilter("all")}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              labFilter === "all" ? "border-sky-500 bg-sky-500 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                            }`}>
                            All Labs
                          </button>
                          {labOptions.map((lab) => (
                            <button key={lab} onClick={() => setLabFilter(lab)}
                              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                labFilter === lab ? "border-sky-500 bg-sky-500 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                              }`}>
                              {lab}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {hasActiveFilter && (
                      <button onClick={() => { setStatusFilter("all"); setLabFilter("all"); setSearchQuery(""); }}
                        className="text-xs text-slate-400 underline underline-offset-2 transition hover:text-slate-600">
                        Clear all filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {loading ? (
                <div className="grid items-start gap-4 xl:grid-cols-2">
                  <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
                </div>
              ) : filtered.length > 0 ? (
                <div className="grid items-start gap-4 xl:grid-cols-2">
                  {filtered.map((req) => <RequestCard key={req.id} req={req} />)}
                </div>
              ) : requests.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="h-8 w-8 text-slate-300" />}
                  title="No test requests yet"
                  hint="When a doctor sends a request to your email, it will appear here."
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
                    <Filter className="h-6 w-6 text-slate-300" />
                  </div>
                  <h2 className="mb-1 text-sm font-semibold text-slate-600">No results match your filters</h2>
                  <button onClick={() => { setStatusFilter("all"); setLabFilter("all"); setSearchQuery(""); }}
                    className="mt-1 text-xs font-medium text-sky-600 underline underline-offset-2 hover:text-sky-700">
                    Clear filters
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <footer className="flex items-center justify-center gap-1.5 pb-8 pt-2">
        <PoveonLogo className="h-4 w-4 opacity-30" />
        <span className="text-xs text-slate-400">Powered by Poveon</span>
      </footer>

      {/* Standing invitation — once per sign-in until they're on a live plan. */}
      {showCarePrompt && (
        <CarePlanPromptModal
          benefits={care.benefits}
          lapsed={care.lapsed}
          onJoin={() => { setShowCarePrompt(false); navigate("care", { enroll: true }); }}
          onClose={() => setShowCarePrompt(false)}
        />
      )}

      {/* The corner of the screen is the doctor's line, not support's. */}
      <CarePlanChatFab role="patient" enabled={care.active} />
    </div>
  );
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm">
        {icon}
      </div>
      <h2 className="mb-1 text-sm font-semibold text-slate-700">{title}</h2>
      <p className="max-w-xs text-xs text-slate-400">{hint}</p>
    </div>
  );
}
