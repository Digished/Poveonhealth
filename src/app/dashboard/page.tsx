"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { PoveonLogo } from "@/components/PoveonLogo";
import { parsePhones } from "@/lib/phones";
import { DobInput } from "@/components/DobInput";
import { PhoneInput } from "@/components/PhoneInput";
import {
  LogOut, Phone, MapPin, Calendar, Stethoscope, FlaskConical,
  ClipboardList, User, ChevronDown, ChevronUp, FileImage, ExternalLink,
  Pencil, Check, X, RefreshCw, MessageCircle, Filter, Search, UserCircle,
  BadgeCheck, Shield, EyeOff, Eye, Star, MessageSquare,
} from "lucide-react";

interface Lab {
  id: string;
  name: string;
  address?: string;
  whatsapp?: string | null;
  phones?: unknown;
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

function formatDob(dob: string | null): string {
  if (!dob) return "";
  try {
    return new Date(dob + "T12:00:00Z").toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  } catch { return dob; }
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
  const [dob, setDob] = useState(profile.dob ?? "");
  const [sex, setSex] = useState(profile.sex ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const body: Record<string, string> = { name: name.trim() };
      if (phone.trim()) body.phone = phone.trim();
      if (dob) body.dob = dob;
      if (sex) body.sex = sex;
      if (address.trim()) body.address = address.trim();
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Date of Birth</label>
            <DobInput value={dob} onChange={setDob} noLabel />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Sex</label>
            <div className="flex gap-2">
              {(["male", "female"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(sex === s ? "" : s)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-xs font-semibold capitalize transition-all ${
                    sex === s ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Home Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Your residential address"
            rows={2}
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white resize-none"
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

export default function DashboardPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [patientEmail, setPatientEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<"tests" | "results" | "security">("tests");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [labFilter, setLabFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetch("/api/patient/me")
      .then(async (res) => {
        if (res.status === 401) { router.replace("/login"); return; }
        const json = await res.json();
        if (!json.success) { router.replace("/login"); return; }
        setPatientEmail(json.patient_email);
        setRequests(json.requests ?? []);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));

    fetch("/api/patient/profile")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.success) setProfile(data.profile); })
      .catch(() => null);
  }, [router]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 sticky top-0 z-20 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center shadow flex-shrink-0">
              <ClipboardList className="w-4 h-4 text-sky-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800 leading-tight">My Tests</h1>
              {patientEmail && <p className="text-xs text-slate-400 truncate max-w-[160px] sm:max-w-none">{patientEmail}</p>}
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50 transition px-3 py-1.5 rounded-lg hover:bg-red-50 flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{loggingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-12">
        {!loading && patientEmail && (
          <>
            {editingProfile ? (
              <ProfilePanel
                profile={profile ?? { name: null, phone: null, dob: null, sex: null, address: null }}
                email={patientEmail}
                onUpdated={(p) => setProfile(p)}
                onClose={() => setEditingProfile(false)}
              />
            ) : (
              <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 px-4 py-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-slate-800 leading-tight">
                      {displayName ?? <span className="text-slate-400 font-normal italic text-sm">No name set</span>}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{patientEmail}</p>
                    {(profile?.dob || profile?.sex || profile?.phone) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
                        {profile.dob && <span className="text-xs text-slate-500"><span className="text-slate-400">DOB:</span> {formatDob(profile.dob)}</span>}
                        {profile.sex && <span className="text-xs text-slate-500 capitalize"><span className="text-slate-400">Sex:</span> {profile.sex}</span>}
                        {profile.phone && <span className="text-xs text-slate-500"><span className="text-slate-400">Tel:</span> {profile.phone}</span>}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingProfile(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700 hover:bg-sky-50 transition px-2.5 py-1.5 rounded-lg border border-sky-100 shrink-0"
                  >
                    <Pencil className="w-3 h-3" />Edit
                  </button>
                </div>
                {!displayName && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3">
                    Set your name so labs and doctors can identify you correctly.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Tab Navigation */}
        {!loading && patientEmail && (
          <div className="flex gap-1 bg-white/60 rounded-xl p-1 border border-white/60 shadow-sm">
            {(["tests", "results", "security"] as const).map((tab) => {
              const labels = { tests: "My Tests", results: "Results", security: "Security" };
              const counts = { tests: requests.length, results: requests.filter((r) => r.status === "done").length, security: 0 };
              return (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}>
                  {tab === "tests" && <ClipboardList className="w-3.5 h-3.5" />}
                  {tab === "results" && <BadgeCheck className="w-3.5 h-3.5" />}
                  {tab === "security" && <Shield className="w-3.5 h-3.5" />}
                  {labels[tab]}
                  {counts[tab] > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                      activeTab === tab ? "bg-slate-100 text-slate-600" : "bg-slate-200/60 text-slate-500"
                    }`}>{counts[tab]}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Security Tab */}
        {!loading && patientEmail && activeTab === "security" && (
          <PatientSecuritySection email={patientEmail} />
        )}

        {/* Results Tab — all completed tests */}
        {!loading && activeTab === "results" && (
          <div className="space-y-4">
            {requests.filter((r) => r.status === "done").length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center mb-3">
                  <BadgeCheck className="w-7 h-7 text-slate-200" />
                </div>
                <h2 className="text-slate-700 font-semibold text-sm mb-1">No completed tests yet</h2>
                <p className="text-slate-400 text-xs max-w-xs">Tests marked as done by the lab will appear here.</p>
              </div>
            ) : (
              requests.filter((r) => r.status === "done").map((req) => (
                <ResultCard key={req.id} req={req} />
              ))
            )}
          </div>
        )}

        {/* Tests Tab */}
        {!loading && activeTab === "tests" && (
          <>
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-700">All Tests</h2>
                <span className="text-xs text-slate-400 bg-white/70 border border-slate-100 rounded-full px-2 py-0.5">
                  {filtered.length}{filtered.length !== requests.length ? ` of ${requests.length}` : ""}
                </span>
              </div>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                  hasActiveFilter ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-white/70 text-slate-500 border-slate-200 hover:border-slate-300"
                }`}
              >
                <Filter className="w-3 h-3" />Filter
                {hasActiveFilter && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 ml-0.5" />}
              </button>
            </div>

            {showFilters && (
              <div ref={filterRef} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4 space-y-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search lab name or test…"
                    className="w-full pl-8 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Status</p>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_FILTER_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                          statusFilter === opt.value ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {labOptions.length > 1 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lab</p>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setLabFilter("all")}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                          labFilter === "all" ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                        }`}>
                        All Labs
                      </button>
                      {labOptions.map((lab) => (
                        <button key={lab} onClick={() => setLabFilter(lab)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                            labFilter === lab ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                          }`}>
                          {lab}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {hasActiveFilter && (
                  <button onClick={() => { setStatusFilter("all"); setLabFilter("all"); setSearchQuery(""); }}
                    className="text-xs text-slate-400 hover:text-slate-600 transition underline underline-offset-2">
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Request list */}
          {filtered.length > 0 ? (
            <div className="space-y-4">
              {filtered.map((req) => <RequestCard key={req.id} req={req} />)}
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center mb-4">
                <ClipboardList className="w-8 h-8 text-slate-300" />
              </div>
              <h2 className="text-slate-700 font-semibold text-base mb-1">No test requests yet</h2>
              <p className="text-slate-400 text-sm max-w-xs">When a doctor sends a request to your email, it will appear here.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center mb-3">
                <Filter className="w-6 h-6 text-slate-300" />
              </div>
              <h2 className="text-slate-600 font-semibold text-sm mb-1">No results match your filters</h2>
              <button onClick={() => { setStatusFilter("all"); setLabFilter("all"); setSearchQuery(""); }}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium mt-1 underline underline-offset-2">
                Clear filters
              </button>
            </div>
          )}
          </>
        )}

        {loading && activeTab === "tests" && (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        )}
      </main>

      <footer className="pb-8 pt-2 flex items-center justify-center gap-1.5">
        <PoveonLogo className="w-4 h-4 opacity-30" />
        <span className="text-xs text-slate-400">Powered by Poveon</span>
      </footer>
    </div>
  );
}
