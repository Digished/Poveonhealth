"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical, LogOut, RefreshCw, Building2, User,
  CalendarDays, TestTube2, ChevronDown, ChevronUp,
  Clock, CheckCircle, Eye, MapPin, Phone, X, Shield, EyeOff,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

interface Lab {
  name: string;
  address: string;
  phones: string[];
  logo_url: string | null;
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

const PROFESSIONAL_PREFIXES = [
  "Dr.", "Prof.", "Nurse", "Pharm.", "CHEW", "CHO",
  "PT", "OT", "Optom.", "MW", "HO", "MO", "RN", "DVM",
];

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
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Phone className="w-3 h-3 shrink-0" />
                {phones.map((p, i) => (
                  <a key={i} href={`tel:${p}`} className="text-medical-600 font-medium">{p}</a>
                ))}
              </div>
            )}
          </div>

          {/* Results — shown when lab has sent results */}
          {req.status === "done" && (req.result_link || req.result_note) && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                Results Available
              </p>
              {req.result_note && (
                <p className="text-sm text-emerald-800 mb-2 leading-relaxed">{req.result_note}</p>
              )}
              {req.result_link && (
                <a
                  href={req.result_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline underline-offset-2 transition"
                >
                  View Results Online →
                </a>
              )}
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

        </div>
      )}
    </div>
  );
}

function DocDashboardInner() {
  const router = useRouter();

  const [doctorEmail, setDoctorEmail] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "incoming" | "seen" | "done">("all");
  const [loggingOut, setLoggingOut] = useState(false);

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
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition text-slate-500 shrink-0"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition text-slate-500 shrink-0"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
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
        {filtered.map((req) => (
          <RequestCard key={req.id} req={req} />
        ))}

        {/* Security settings */}
        {!loading && <DocSecuritySection />}
      </main>

      {/* Footer */}
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
        <PoveonLogo className="w-4 h-4 opacity-40" />
        <span>© {new Date().getFullYear()} Poveon. All rights reserved.</span>
      </div>
    </div>
  );
}

function DocSecuritySection() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newPin, setNewPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pinRefs = { new: [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)], confirm: [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)] };

  useEffect(() => {
    fetch("/api/doc-login/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          fetch("/api/doc-login/check-pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: d.doctor_email }),
          }).then((r) => r.json()).then((data) => setHasPin(data.hasPin));
        }
      })
      .catch(() => {});
  }, []);

  function handleDigit(
    arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.RefObject<HTMLInputElement>[], index: number, value: string
  ) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...arr]; next[index] = digit; setArr(next);
    if (digit && index < 3) refs[index + 1].current?.focus();
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const p1 = newPin.join(""); const p2 = confirmPin.join("");
    if (p1.length !== 4) { setError("Enter all 4 digits."); return; }
    if (p1 !== p2) { setError("PINs do not match."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/doc-login/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: p1 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed."); return; }
      setHasPin(true); setShowForm(false);
      setNewPin(["", "", "", ""]); setConfirmPin(["", "", "", ""]);
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  }

  async function handleRemovePin() {
    if (!confirm("Remove your PIN? You'll need to use an email code to log in.")) return;
    setSaving(true);
    try {
      await fetch("/api/doc-login/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "" }),
      });
      setHasPin(false);
    } catch {} finally { setSaving(false); }
  }

  const PinRow = ({ values, setValues, refs, label }: { values: string[]; setValues: React.Dispatch<React.SetStateAction<string[]>>; refs: React.RefObject<HTMLInputElement>[]; label: string }) => (
    <div>
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <div className="flex gap-2">
        {values.map((d, i) => (
          <input key={i} ref={refs[i]} type={showPin ? "text" : "password"} inputMode="numeric" maxLength={2} value={d}
            onChange={(e) => handleDigit(values, setValues, refs, i, e.target.value)}
            onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) refs[i - 1].current?.focus(); }}
            className="w-12 h-12 text-center text-lg font-bold text-slate-800 border-2 border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 transition" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 mt-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" />Security
        </p>
        {hasPin && !showForm && (
          <div className="flex gap-2">
            <button onClick={() => setShowForm(true)} className="text-xs text-medical-600 hover:underline">Change PIN</button>
            <button onClick={handleRemovePin} disabled={saving} className="text-xs text-red-500 hover:underline">Remove PIN</button>
          </div>
        )}
        {!hasPin && !showForm && (
          <button onClick={() => setShowForm(true)} className="text-xs text-medical-600 hover:underline">Set up PIN</button>
        )}
      </div>
      {hasPin !== null && !showForm && (
        <p className="text-xs text-slate-400">{hasPin ? "4-digit PIN is active — used for quick login." : "No PIN set — you log in with an email code each time."}</p>
      )}
      {showForm && (
        <form onSubmit={handleSavePin} className="mt-3 space-y-3">
          <div className="flex items-center gap-2 justify-end mb-1">
            <button type="button" onClick={() => setShowPin(v => !v)} className="text-xs text-slate-400 flex items-center gap-1">
              <EyeOff className="w-3 h-3" />{showPin ? "Hide" : "Show"} digits
            </button>
          </div>
          <PinRow values={newPin} setValues={setNewPin} refs={pinRefs.new} label="New PIN" />
          <PinRow values={confirmPin} setValues={setConfirmPin} refs={pinRefs.confirm} label="Confirm PIN" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => { setShowForm(false); setNewPin(["","","",""]); setConfirmPin(["","","",""]); setError(""); }}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white text-xs font-semibold transition">
              {saving ? "Saving…" : "Save PIN"}</button>
          </div>
        </form>
      )}
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
