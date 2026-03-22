"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { PoveonLogo } from "@/components/PoveonLogo";
import {
  LogOut, Phone, MapPin, Calendar, Stethoscope, FlaskConical,
  ClipboardList, User, ChevronDown, ChevronUp, FileImage, ExternalLink,
  Pencil, Check, X, RefreshCw, MessageCircle, Filter, Search, UserCircle,
  BadgeCheck, Shield, EyeOff, Eye,
} from "lucide-react";

interface Lab {
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

function parsePhones(phones: unknown): string[] {
  if (Array.isArray(phones)) return phones as string[];
  if (typeof phones === "string") {
    try { const p = JSON.parse(phones); return Array.isArray(p) ? p : [phones]; } catch { return [phones]; }
  }
  return [];
}

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
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234 800 000 0000"
            type="tel"
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
          />
          <p className="text-xs text-slate-400 mt-1">Include country code. Doctors can auto-fill your info when entering this number.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Date of Birth</label>
            <input
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              type="date"
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Sex</label>
            <div className="flex gap-2">
              {(["male", "female", "other"] as const).map((s) => (
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
          {req.status === "done" && (req.result_link || req.result_note) && (
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
            </div>
          )}
          {(phones.length > 0 || whatsapps.length > 0) && (
            <div className="pt-2 border-t border-slate-50 flex flex-wrap gap-2">
              {phones.map((phone, i) => (
                <a key={i} href={`tel:${phone}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition px-3 py-1.5 rounded-full">
                  <Phone className="w-3 h-3" />{phone}
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
        </div>
      )}
    </div>
  );
}

function PatientSecuritySection() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"set" | "change" | "remove">("set");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/patient/check-pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      .then((r) => r.json())
      .then((d) => setHasPin(!!d.hasPin))
      .catch(() => setHasPin(false));
  }, []);

  function openPanel(m: "set" | "change" | "remove") {
    setMode(m); setOpen(true); setPin(""); setConfirmPin(""); setError(""); setSuccess("");
  }

  async function savePin() {
    if (mode !== "remove") {
      if (!/^\d{4}$/.test(pin)) { setError("PIN must be exactly 4 digits."); return; }
      if (pin !== confirmPin) { setError("PINs do not match."); return; }
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const res = await fetch("/api/patient/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: mode === "remove" ? "" : pin }),
      });
      const data = await res.json();
      if (data.success) {
        setHasPin(mode !== "remove");
        setSuccess(mode === "remove" ? "PIN removed." : "PIN saved successfully.");
        setOpen(false);
      } else {
        setError(data.error ?? "Failed to save. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (hasPin === null) return null;

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-sm overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-sky-500" />
            <h2 className="text-sm font-bold text-slate-800">Security</h2>
          </div>
        </div>
        {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-3">{success}</p>}
        <p className="text-xs text-slate-500 mb-3">
          {hasPin
            ? "You have a 4-digit login PIN set. Use it for quick sign-in."
            : "Set a 4-digit PIN for faster login — no need for an email code every time."}
        </p>
        {!open ? (
          <div className="flex flex-wrap gap-2">
            {!hasPin && (
              <button onClick={() => openPanel("set")}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-sky-500 text-white hover:bg-sky-600 transition">
                <Shield className="w-3.5 h-3.5" />Set up PIN
              </button>
            )}
            {hasPin && (
              <>
                <button onClick={() => openPanel("change")}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-sky-50 text-sky-700 border border-sky-100 hover:bg-sky-100 transition">
                  <Shield className="w-3.5 h-3.5" />Change PIN
                </button>
                <button onClick={() => openPanel("remove")}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition">
                  <X className="w-3.5 h-3.5" />Remove PIN
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {mode === "remove" ? (
              <p className="text-sm text-slate-600">Are you sure you want to remove your login PIN? You&apos;ll need an email code to log in.</p>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                    {mode === "change" ? "New PIN" : "Create a 4-digit PIN"}
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? "text" : "password"}
                      inputMode="numeric"
                      maxLength={4}
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
                  <input
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="••••"
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white tracking-[0.5em]"
                  />
                </div>
              </>
            )}
            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={savePin} disabled={saving}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                  mode === "remove" ? "bg-red-500 text-white hover:bg-red-600" : "bg-sky-500 text-white hover:bg-sky-600"
                }`}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Saving…" : mode === "remove" ? "Remove PIN" : "Save PIN"}
              </button>
              <button onClick={() => setOpen(false)}
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

        {!loading && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-700">Test Requests</h2>
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
        )}

        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : filtered.length > 0 ? (
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
      </main>

      {!loading && patientEmail && (
        <div className="max-w-2xl mx-auto px-4 pb-4">
          <PatientSecuritySection />
        </div>
      )}

      <footer className="pb-8 pt-2 flex items-center justify-center gap-1.5">
        <PoveonLogo className="w-4 h-4 opacity-30" />
        <span className="text-xs text-slate-400">Powered by Poveon</span>
      </footer>
    </div>
  );
}
