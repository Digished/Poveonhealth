"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PoveonLogo } from "@/components/PoveonLogo";
import {
  LogOut, Phone, MapPin, Calendar, Stethoscope, FlaskConical,
  ClipboardList, User, ChevronDown, ChevronUp, FileImage, ExternalLink,
  Pencil, Check, X, RefreshCw, MessageCircle,
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
  created_at: string;
  seen_at: string | null;
  completed_at: string | null;
  lab: Lab;
}

interface PatientProfile {
  name: string | null;
  phone: string | null;
}

const STATUS_MAP = {
  incoming: { label: "Pending", cls: "bg-amber-100 text-amber-700 border border-amber-200" },
  seen: { label: "At Lab", cls: "bg-blue-100 text-blue-700 border border-blue-200" },
  done: { label: "Completed", cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
};

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

function RequestCard({
  req,
  onProfileUpdated,
}: {
  req: LabRequest;
  onProfileUpdated?: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(req.patient_name ?? "");
  const [saving, setSaving] = useState(false);

  const st = STATUS_MAP[req.status] ?? { label: req.status, cls: "bg-slate-100 text-slate-600 border border-slate-200" };
  const phones = parsePhones(req.lab.phones);
  const whatsapps = parseWhatsApp(req.lab.whatsapp);

  async function saveName() {
    if (!nameVal.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/patient/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameVal.trim() }),
      });
      setEditingName(false);
      onProfileUpdated?.(nameVal.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
      {/* Header row */}
      <button
        className="w-full text-left p-5"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
                {req.patient_name || "Patient"}
              </p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${st.cls}`}>
                {st.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{req.code}</p>
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />}
        </div>

        {/* Lab info */}
        <div className="flex items-center gap-1.5 mb-1">
          <FlaskConical className="w-3.5 h-3.5 text-sky-500 shrink-0" />
          <p className="text-sm font-medium text-slate-700">{req.lab.name}</p>
        </div>
        {req.lab.address && (
          <div className="flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500">{req.lab.address}</p>
          </div>
        )}

        {/* Tests preview */}
        {req.tests && req.tests !== "See attached image" && (
          <div className="mt-3">
            <TestTags tests={req.tests} />
          </div>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-50 px-5 pb-5 pt-4 space-y-4">
          {/* Edit patient name */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Your Name on Record</p>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400"
                  placeholder="Your full name"
                  autoFocus
                />
                <button
                  onClick={saveName}
                  disabled={saving}
                  className="p-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => { setEditingName(false); setNameVal(req.patient_name ?? ""); }}
                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-sm text-slate-700">{req.patient_name || <span className="text-slate-400 italic">Not set</span>}</span>
                </div>
                <button
                  onClick={() => setEditingName(true)}
                  className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-800 font-medium transition"
                >
                  <Pencil className="w-3 h-3" /> Update name
                </button>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">Updating your name here reflects on all future requests.</p>
          </div>

          {/* Diagnosis */}
          {req.diagnosis && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Diagnosis</p>
              <div className="flex items-start gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-600">{req.diagnosis}</p>
              </div>
            </div>
          )}

          {/* Schedule */}
          {req.schedule && SCHEDULE_LABELS[req.schedule] && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <p className="text-sm text-slate-600">
                <span className="font-medium">Schedule: </span>{SCHEDULE_LABELS[req.schedule]}
              </p>
            </div>
          )}

          {/* Test image */}
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

          {/* Dates */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
            <span>Submitted: {formatDate(req.created_at)}</span>
            {req.seen_at && <span>Arrived: {formatDate(req.seen_at)}</span>}
            {req.completed_at && <span>Completed: {formatDate(req.completed_at)}</span>}
          </div>

          {/* Contact buttons */}
          <div className="pt-2 border-t border-slate-50 flex flex-wrap gap-2">
            {phones.map((phone, i) => (
              <a
                key={i}
                href={`tel:${phone}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition px-3 py-1.5 rounded-full"
              >
                <Phone className="w-3 h-3" />
                {phone}
              </a>
            ))}
            {whatsapps.map((wa, i) => (
              <a
                key={i}
                href={`https://wa.me/${wa.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-green-500 hover:bg-green-600 transition px-3 py-1.5 rounded-full shadow-sm"
              >
                <MessageCircle className="w-3 h-3" />
                WhatsApp
              </a>
            ))}
          </div>
        </div>
      )}
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

export default function DashboardPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [patientEmail, setPatientEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

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
    try { await fetch("/api/patient/logout", { method: "POST" }); } catch { /* ignore */ }
    router.replace("/login");
  }

  function handleProfileUpdated(name: string) {
    setProfile((p) => ({ ...(p ?? { phone: null }), name }));
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center shadow flex-shrink-0">
              <ClipboardList className="w-4 h-4 text-sky-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-800 leading-tight">My Tests</h1>
              {patientEmail && <p className="text-xs text-slate-400 truncate">{patientEmail}</p>}
            </div>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50 transition px-3 py-1.5 rounded-lg hover:bg-red-50 flex-shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Profile banner */}
        {!loading && patientEmail && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white/60 px-4 py-3 flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center shrink-0">
              <User className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 truncate">{profile?.name || "Patient"}</p>
              <p className="text-xs text-slate-500 truncate">{patientEmail}</p>
            </div>
            <span className="text-xs text-slate-400 shrink-0">{requests.length} test{requests.length !== 1 ? "s" : ""}</span>
          </div>
        )}

        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : requests.length > 0 ? (
          requests.map((req) => (
            <RequestCard key={req.id} req={req} onProfileUpdated={handleProfileUpdated} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center mb-4">
              <ClipboardList className="w-8 h-8 text-slate-300" />
            </div>
            <h2 className="text-slate-700 font-semibold text-base mb-1">No test requests found</h2>
            <p className="text-slate-400 text-sm max-w-xs">
              Requests sent to your email address will appear here.
            </p>
          </div>
        )}
      </main>

      <footer className="pb-8 pt-2 flex items-center justify-center gap-1.5">
        <PoveonLogo className="w-4 h-4 opacity-30" />
        <span className="text-xs text-slate-400">Powered by Poveon</span>
      </footer>
    </div>
  );
}
