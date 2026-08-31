"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { ADHERENCE_OPTIONS, DURATION_OPTIONS } from "@/components/consults/baseline";
import {
  Activity, BadgeCheck, Banknote, Check, ExternalLink, FileText, HeartPulse, Loader2, Play,
  RefreshCw, Save, Search, Settings2, ShieldCheck, TrendingUp, Users, UserCog, X,
} from "lucide-react";
import { AdminOverlay } from "@/components/admin/AdminOverlay";
import { SubTabs } from "@/components/admin/SubTabs";

type Settings = {
  price_naira: number;
  doctor_share_naira: number;
  message_allowance: number;
  release_months: number;
  default_doctor_cap: number;
  lab_discount_percent: number;
  pharmacy_discount_percent: number;
  topup_price_naira: number;
  topup_messages: number;
};

type Member = {
  id: string; code: string; full_name: string; email: string; phone: string | null;
  conditions: string[]; status: string; doctor_email: string | null;
  subscribed_at: string | null; expires_at: string | null; amount_paid: number | null;
  messages_used: number; message_allowance: number;
};

type Summary = {
  active_members: number; unassigned: number; gross_revenue: number; committed_to_doctors: number;
};

type ReleaseInfo = {
  period: string;
  released_count: number;
  released_amount: number;
  doctors: { doctor_email: string; amount: number }[];
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  pending_payment: "bg-amber-100 text-amber-700",
  expired: "bg-slate-100 text-slate-500",
  cancelled: "bg-red-100 text-red-600",
};

type SubTab = "members" | "doctors" | "baseline" | "pricing" | "payouts";

export function AdminCarePlanTab() {
  const [subTab, setSubTab] = useState<SubTab>("members");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <HeartPulse className="h-5 w-5" /> Care Plan
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            The annual hypertension &amp; diabetes subscription — members, pricing and doctor payouts.
          </p>
        </div>
      </div>

      <SubTabs
        value={subTab}
        onChange={setSubTab}
        items={[
          { key: "members", label: "Members", icon: Users },
          { key: "doctors", label: "Doctor approvals", icon: ShieldCheck },
          { key: "baseline", label: "Health statistics", icon: Activity },
          { key: "pricing", label: "Pricing", icon: Settings2 },
          { key: "payouts", label: "Doctor payouts", icon: Banknote },
        ] as const}
      />

      {subTab === "members" && <MembersPanel />}
      {subTab === "doctors" && <DoctorApprovalsPanel />}
      {subTab === "baseline" && <BaselineStatsPanel />}
      {subTab === "pricing" && <PricingPanel />}
      {subTab === "payouts" && <PayoutsPanel />}
    </div>
  );
}

// ── Members ─────────────────────────────────────────────────────────────────

/** Switch a member on by hand — for anyone who paid outside Paystack. */
function ActivateForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving || !email.includes("@")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/consults/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not activate."); return; }
      toast.success(
        d.member?.doctor_email
          ? `Active — code ${d.member.code}, assigned to ${d.member.doctor_email}`
          : `Active — code ${d.member.code}. No approved doctor was free, so assign one below.`
      );
      setEmail("");
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Activate a member by hand</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        For someone who paid by transfer, cash, or as part of a group. Just the email — we fill in
        their name and phone from whatever we already hold (their portal profile, or their last lab
        request), and they can correct it themselves. It runs the same activation as a card payment:
        a real care code, a doctor assigned by the usual rotation, and that doctor&apos;s pool picks
        them up.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          autoFocus
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder="member@example.com"
          className="min-w-[240px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-medical-500 focus:outline-none"
        />
        <button
          onClick={save}
          disabled={saving || !email.includes("@")}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? "Activating…" : "Activate"}
        </button>
      </div>
    </div>
  );
}

function MembersPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [reassigning, setReassigning] = useState<Member | null>(null);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/consults/members?${params}`, { cache: "no-store" });
      const d = await res.json();
      if (!d.success) return;
      setMembers((prev) => (append ? [...prev, ...d.members] : d.members));
      setSummary(d.summary);
      setTotal(d.total);
      setHasMore(d.has_more);
      setPage(nextPage);
    } catch {
      toast.error("Failed to load members.");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(() => load(1, false), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function assign(member: Member, doctorEmail: string | null) {
    setAssigning(member.id);
    try {
      const res = await fetch("/api/admin/consults/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: member.id, doctor_email: doctorEmail }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not reassign."); return; }
      toast.success(doctorEmail ? "Member reassigned" : "Member unassigned");
      setReassigning(null);
      load(1, false);
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminStat label="Active members" value={String(summary?.active_members ?? 0)} icon={<Users className="h-4 w-4" />} />
        <AdminStat label="Unassigned" value={String(summary?.unassigned ?? 0)} icon={<UserCog className="h-4 w-4" />} tone={summary?.unassigned ? "amber" : "slate"} />
        <AdminStat label="Gross revenue" value={naira(summary?.gross_revenue ?? 0)} icon={<TrendingUp className="h-4 w-4" />} tone="emerald" />
        <AdminStat label="Committed to doctors" value={naira(summary?.committed_to_doctors ?? 0)} icon={<Banknote className="h-4 w-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, code or doctor…"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-medical-500 focus:outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); }}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_payment">Pending payment</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          onClick={() => load(1, false)}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
        <button
          onClick={() => setActivating((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
        >
          <Check className="h-4 w-4" /> Activate a member
        </button>
      </div>

      {activating && (
        <ActivateForm onClose={() => setActivating(false)} onDone={() => { setActivating(false); load(1, false); }} />
      )}

      {reassigning && (
        <AssignDoctorDialog
          member={reassigning}
          busy={assigning === reassigning.id}
          onClose={() => setReassigning(null)}
          onPick={(email) => assign(reassigning, email)}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-cards">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-semibold">Member</th>
                <th className="px-4 py-2.5 font-semibold">Conditions</th>
                <th className="px-4 py-2.5 font-semibold">Doctor</th>
                <th className="px-4 py-2.5 font-semibold">Messages</th>
                <th className="px-4 py-2.5 font-semibold">Paid</th>
                <th className="px-4 py-2.5 font-semibold">Renews</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {members.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">No members yet.</td>
                </tr>
              )}
              {members.map((m) => (
                <tr key={m.id} className="transition hover:bg-white/5">
                  <td className="px-4 py-3" data-label="Member">
                    <p className="font-semibold text-white">{m.full_name}</p>
                    <p className="text-xs text-slate-400">{m.email}</p>
                    <p className="font-mono text-[11px] text-slate-500">{m.code}</p>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize text-slate-300" data-label="Conditions">{m.conditions.join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-300" data-label="Doctor">
                    {m.doctor_email ?? <span className="text-amber-400">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400" data-label="Messages">
                    {m.messages_used}/{m.message_allowance}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300" data-label="Paid">{m.amount_paid ? naira(m.amount_paid) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400" data-label="Renews">{formatDate(m.expires_at)}</td>
                  <td className="px-4 py-3" data-label="Status">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[m.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {m.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" data-label="" data-card-actions>
                    <button
                      onClick={() => setReassigning(m)}
                      disabled={assigning === m.id}
                      className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/20 disabled:opacity-50"
                    >
                      {assigning === m.id ? "…" : m.doctor_email ? "Reassign" : "Assign"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 px-4 py-3">
          <p className="text-xs text-slate-500">Showing {members.length} of {total}</p>
          {hasMore && (
            <button
              onClick={() => load(page + 1, true)}
              disabled={loading}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/20 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Show more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type AssignableDoctor = {
  email: string; name: string; specialty: string | null;
  approved: boolean; accepting: boolean; members: number; cap: number; full: boolean;
};

/**
 * Pick the doctor a member goes to.
 *
 * Replaces typing an email from memory — which also failed outright whenever
 * the casing didn't match the stored profile.
 */
function AssignDoctorDialog({
  member, busy, onClose, onPick,
}: {
  member: Member;
  busy: boolean;
  onClose: () => void;
  onPick: (email: string | null) => void;
}) {
  const [doctors, setDoctors] = useState<AssignableDoctor[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/consults/doctors?${params}`, { cache: "no-store" });
      const d = await res.json();
      if (d.success) setDoctors(d.doctors);
    } catch {
      toast.error("Could not load doctors.");
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <AdminOverlay onClose={() => onClose()}>
      <div className="flex max-h-modal w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-900 shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-5">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">Assign a doctor</h3>
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {member.full_name} · {member.email}
            </p>
            {member.doctor_email && (
              <p className="mt-1 text-xs text-slate-500">Currently with {member.doctor_email}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-white/10 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-medical-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && doctors.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
            </div>
          ) : doctors.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No doctors match that.</p>
          ) : (
            <ul className="space-y-1.5">
              {doctors.map((doc) => {
                const current = doc.email === member.doctor_email;
                return (
                  <li key={doc.email}>
                    <button
                      onClick={() => onPick(doc.email)}
                      disabled={busy || current}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${
                        current
                          ? "border-medical-500/40 bg-medical-600/15"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-white">{doc.name}</span>
                          {doc.approved ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                              <BadgeCheck className="h-3 w-3" /> Approved
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              Not approved
                            </span>
                          )}
                          {doc.full && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                              At cap
                            </span>
                          )}
                          {!doc.accepting && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                              Paused
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">{doc.email}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {doc.members} of {doc.cap} members
                          {doc.specialty ? ` · ${doc.specialty}` : ""}
                        </span>
                      </span>
                      {current && <Check className="h-4 w-4 shrink-0 text-medical-300" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {member.doctor_email && (
          <div className="border-t border-white/10 p-4">
            <button
              onClick={() => onPick(null)}
              disabled={busy}
              className="w-full rounded-lg border border-white/10 py-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              Unassign — leave this member without a doctor
            </button>
          </div>
        )}
      </div>
    </AdminOverlay>
  );
}

function AdminStat({
  label, value, icon, tone = "slate",
}: {
  label: string; value: string; icon: React.ReactNode; tone?: "slate" | "emerald" | "amber";
}) {
  const tones = {
    slate: "bg-white/10 text-slate-300",
    emerald: "bg-emerald-500/20 text-emerald-300",
    amber: "bg-amber-500/20 text-amber-300",
  };
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</div>
      <p className="mt-2.5 truncate text-xl font-extrabold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

// ── Doctor approvals ────────────────────────────────────────────────────────

type CredentialRow = {
  email: string;
  doctor_name: string | null;
  phone: string | null;
  hospitals: string[];
  mdcn_number: string | null;
  license_expires_at: string | null;
  license_doc_url: string | null;
  id_doc_url: string | null;
  cv_url: string | null;
  qualifications: string | null;
  specialty: string | null;
  years_experience: number | null;
  note: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  approved: boolean;
  active_members: number;
};

const CRED_STATUS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
  unsubmitted: "bg-slate-100 text-slate-500",
};

/**
 * Every doctor who has filed credentials, pending first.
 *
 * Approving is what lets a doctor be assigned care-plan members at all, so the
 * documents are here to be opened, not just ticked off.
 */
function DoctorApprovalsPanel() {
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      const res = await fetch(`/api/admin/doctor-credentials?${params}`, { cache: "no-store" });
      const d = await res.json();
      if (d.success) setRows(d.credentials);
    } catch {
      toast.error("Failed to load applications.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function decide(email: string, decision: "approve" | "reject" | "revoke") {
    let note: string | null = null;
    if (decision === "reject") {
      note = window.prompt("What does this doctor need to fix? (emailed to them)");
      if (note === null) return;
    } else if (decision === "revoke") {
      if (!window.confirm("Stop assigning new members to this doctor? Members they already carry stay with them.")) return;
    }
    setBusy(email);
    try {
      const res = await fetch("/api/admin/doctor-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, decision, note }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "That didn't work."); return; }
      toast.success(
        decision === "approve" ? "Approved — the doctor has been emailed"
        : decision === "reject" ? "Rejected — the doctor has been emailed"
        : "Approval revoked"
      );
      load();
    } finally {
      setBusy(null);
    }
  }

  async function openDocument(email: string, slot: string) {
    const res = await fetch(
      `/api/admin/doctor-credentials/document?email=${encodeURIComponent(email)}&slot=${slot}`
    );
    const d = await res.json();
    if (!res.ok || !d.success) { toast.error(d.error ?? "Could not open that document."); return; }
    window.open(d.url, "_blank", "noopener,noreferrer");
  }

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-400">
          {pending > 0
            ? `${pending} application${pending === 1 ? "" : "s"} waiting on you.`
            : "Nothing waiting on you."}
        </p>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="ml-auto rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value="">All applications</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {rows.length === 0 && !loading ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center">
          <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <p className="text-sm font-semibold text-slate-300">No applications yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Doctors file their credentials from the Care Plan tab of their dashboard.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.email} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{r.doctor_name ?? r.email}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CRED_STATUS[r.status] ?? CRED_STATUS.unsubmitted}`}>
                      {r.status}
                    </span>
                    {r.approved && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                        <BadgeCheck className="h-3 w-3" /> Taking members
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{r.email}{r.phone ? ` · ${r.phone}` : ""}</p>
                  {r.hospitals.length > 0 && (
                    <p className="text-xs text-slate-500">{r.hospitals.join(", ")}</p>
                  )}
                </div>
                <div className="text-right text-xs text-slate-400">
                  <p>{r.active_members} active member{r.active_members === 1 ? "" : "s"}</p>
                  {r.submitted_at && <p className="text-slate-500">Filed {formatDate(r.submitted_at)}</p>}
                </div>
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                <CredField label="MDCN number" value={r.mdcn_number} />
                <CredField label="Licence expires" value={r.license_expires_at ? formatDate(r.license_expires_at) : null} />
                <CredField label="Qualifications" value={r.qualifications} />
                <CredField label="Specialty" value={r.specialty} />
                <CredField label="Years in practice" value={r.years_experience != null ? String(r.years_experience) : null} />
              </dl>

              {r.note && (
                <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs leading-relaxed text-slate-300">
                  {r.note}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  ["license", "Practising licence", r.license_doc_url],
                  ["id", "Government ID", r.id_doc_url],
                  ["cv", "CV", r.cv_url],
                ] as const).map(([slot, label, present]) => (
                  <button
                    key={slot}
                    onClick={() => openDocument(r.email, slot)}
                    disabled={!present}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-30"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {label}
                    {present ? <ExternalLink className="h-3 w-3 text-slate-400" /> : <span className="text-slate-500">— none</span>}
                  </button>
                ))}
              </div>

              {r.review_note && r.status === "rejected" && (
                <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  Told them: {r.review_note}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                {!r.approved && (
                  <button
                    onClick={() => decide(r.email, "approve")}
                    disabled={busy === r.email || !r.license_doc_url}
                    title={r.license_doc_url ? undefined : "No practising licence on file"}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {busy === r.email ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Approve
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button
                    onClick={() => decide(r.email, "reject")}
                    disabled={busy === r.email}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject with a reason
                  </button>
                )}
                {r.approved && (
                  <button
                    onClick={() => decide(r.email, "revoke")}
                    disabled={busy === r.email}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-4 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                  >
                    Stop new assignments
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CredField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{value || <span className="text-slate-600">—</span>}</dd>
    </div>
  );
}

// ── Health statistics ───────────────────────────────────────────────────────

type BaselineStats = {
  total_members: number;
  captured: number;
  adherence: { key: string; count: number }[];
  hypertension_years: { years: number; count: number }[];
  diabetes_years: { years: number; count: number }[];
  bp: {
    reported: number; very_high: number; high: number; raised: number; at_target: number;
    systolic_avg: number | null; diastolic_avg: number | null;
  };
  glucose: {
    fasting: number; fasting_avg: number | null; fasting_high: number;
    random: number; random_avg: number | null; random_high: number;
  };
};

/**
 * The membership as it looked on day one — built from the baseline answers
 * everyone gives before they pay, so it says something about who is joining
 * rather than who has been active since.
 */
function BaselineStatsPanel() {
  const [stats, setStats] = useState<BaselineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/consults/baseline", { cache: "no-store" });
        const d = await res.json();
        if (cancelled) return;
        if (!res.ok || !d.success) setError(d.error ?? "Could not load statistics.");
        else setStats(d);
      } catch {
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl border border-white/10 bg-white/5" />;
  }
  if (error || !stats) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
        {error || "No statistics yet."}
      </div>
    );
  }

  if (stats.captured === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-slate-400">
        No baseline answers yet. Members answer these questions while they enrol, so this fills in as
        people sign up.
      </div>
    );
  }

  const bp = stats.bp;
  const glu = stats.glucose;
  const offTarget = bp.very_high + bp.high + bp.raised;
  const adherenceTotal = stats.adherence.reduce((sum, a) => sum + a.count, 0);
  const htnTotal = stats.hypertension_years.reduce((sum, r) => sum + r.count, 0);
  const dmTotal = stats.diabetes_years.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat
          label={`Baselines on file (of ${stats.total_members} members)`}
          value={String(stats.captured)}
          icon={<Activity className="h-4 w-4" />}
        />
        <AdminStat
          label="Average blood pressure"
          value={bp.systolic_avg != null && bp.diastolic_avg != null ? `${bp.systolic_avg}/${bp.diastolic_avg}` : "—"}
          icon={<HeartPulse className="h-4 w-4" />}
          tone={bp.systolic_avg != null && bp.systolic_avg >= 140 ? "amber" : "emerald"}
        />
        <AdminStat
          label="Joined above BP target"
          value={bp.reported ? `${Math.round((offTarget / bp.reported) * 100)}%` : "—"}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="amber"
        />
        <AdminStat
          label="Average fasting sugar (mg/dL)"
          value={glu.fasting_avg != null ? String(glu.fasting_avg) : "—"}
          icon={<Activity className="h-4 w-4" />}
          tone={glu.fasting_avg != null && glu.fasting_avg >= 126 ? "amber" : "emerald"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatCard title="How members take their medication" total={adherenceTotal}>
          {ADHERENCE_OPTIONS.map((o) => (
            <StatBar
              key={o.value}
              label={o.label}
              count={stats.adherence.find((a) => a.key === o.value)?.count ?? 0}
              total={adherenceTotal}
            />
          ))}
        </StatCard>

        <StatCard title="Blood pressure at sign-up" total={bp.reported} unit="reported a reading">
          <StatBar label="Very high (180/120+)" count={bp.very_high} total={bp.reported} tone="red" />
          <StatBar label="High (140/90+)" count={bp.high} total={bp.reported} tone="amber" />
          <StatBar label="Raised (130/80+)" count={bp.raised} total={bp.reported} tone="amber" />
          <StatBar label="At target" count={bp.at_target} total={bp.reported} tone="emerald" />
        </StatCard>

        <StatCard title="Years with hypertension" total={htnTotal}>
          {DURATION_OPTIONS.map((o) => (
            <StatBar
              key={o.value}
              label={o.label}
              count={stats.hypertension_years.find((r) => r.years === o.value)?.count ?? 0}
              total={htnTotal}
            />
          ))}
        </StatCard>

        <StatCard title="Years with diabetes" total={dmTotal}>
          {DURATION_OPTIONS.map((o) => (
            <StatBar
              key={o.value}
              label={o.label}
              count={stats.diabetes_years.find((r) => r.years === o.value)?.count ?? 0}
              total={dmTotal}
            />
          ))}
        </StatCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Fasting sugar</p>
          <p className="mt-1 text-2xl font-extrabold text-white">
            {glu.fasting_avg != null ? `${glu.fasting_avg} mg/dL` : "—"}
          </p>
          <p className="text-xs text-slate-400">
            {glu.fasting} reported · {glu.fasting_high} at or above 126
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Random sugar</p>
          <p className="mt-1 text-2xl font-extrabold text-white">
            {glu.random_avg != null ? `${glu.random_avg} mg/dL` : "—"}
          </p>
          <p className="text-xs text-slate-400">
            {glu.random} reported · {glu.random_high} at or above 200
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Readings are self-reported at enrolment and are not a substitute for a clinic measurement.
      </p>
    </div>
  );
}

function StatCard({
  title, total, unit = "answered", children,
}: {
  title: string; total: number; unit?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="text-xs text-slate-400">{total} {unit}</span>
      </div>
      <div className="mt-3 space-y-2.5">
        {total === 0 ? <p className="text-xs text-slate-500">No answers yet.</p> : children}
      </div>
    </div>
  );
}

const BAR_TONES: Record<string, string> = {
  medical: "bg-medical-400",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
};

function StatBar({
  label, count, total, tone = "medical",
}: {
  label: string; count: number; total: number; tone?: "medical" | "emerald" | "amber" | "red";
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-slate-300">{label}</span>
        <span className="shrink-0 font-semibold text-white">
          {count} <span className="font-normal text-slate-500">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${BAR_TONES[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Pricing ─────────────────────────────────────────────────────────────────

function PricingPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/consults/settings", { cache: "no-store" });
      const d = await res.json();
      if (d.success) { setSettings(d.settings); setForm(d.settings); }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/consults/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not save."); return; }
      setSettings(d.settings);
      toast.success("Care plan pricing updated");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <div className="h-64 animate-pulse rounded-xl border border-white/10 bg-white/5" />;
  }

  const poveonShare = form.price_naira - form.doctor_share_naira;
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-sm font-bold text-white">Commercial terms</h3>
        <p className="mt-1 text-xs text-slate-400">
          New members are sold on these terms. Entitlements already open keep the terms they were created
          on, so nobody&apos;s agreed pay changes retroactively.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Subscription price (₦ / year)"
            value={form.price_naira}
            onChange={(v) => setForm({ ...form, price_naira: v })}
          />
          <NumberField
            label="Doctor's share (₦ / member / year)"
            value={form.doctor_share_naira}
            onChange={(v) => setForm({ ...form, doctor_share_naira: v })}
          />
          <NumberField
            label="Messages included per year"
            value={form.message_allowance}
            onChange={(v) => setForm({ ...form, message_allowance: v })}
          />
          <NumberField
            label="Release the doctor's share over (months)"
            value={form.release_months}
            onChange={(v) => setForm({ ...form, release_months: v })}
          />
          <NumberField
            label="Default members per doctor per year"
            value={form.default_doctor_cap}
            onChange={(v) => setForm({ ...form, default_doctor_cap: v })}
          />
          <div />
          <NumberField
            label="Lab discount (%)"
            value={form.lab_discount_percent}
            onChange={(v) => setForm({ ...form, lab_discount_percent: v })}
          />
          <NumberField
            label="Pharmacy discount (%)"
            value={form.pharmacy_discount_percent}
            onChange={(v) => setForm({ ...form, pharmacy_discount_percent: v })}
          />
        </div>

        <div className="mt-5 rounded-lg border border-white/10 bg-white/5 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Extra messages
          </h4>
          <p className="mt-1 text-xs text-slate-400">
            What a member pays when their yearly allowance runs out before the year does. Bought as
            one bundle, added to the allowance immediately.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Bundle size (messages)"
              value={form.topup_messages ?? 40}
              onChange={(v) => setForm({ ...form, topup_messages: v })}
            />
            <NumberField
              label="Bundle price (₦)"
              value={form.topup_price_naira ?? 10000}
              onChange={(v) => setForm({ ...form, topup_price_naira: v })}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SplitCard label="Member pays" value={naira(form.price_naira)} tone="slate" />
          <SplitCard label="Doctor earns" value={naira(form.doctor_share_naira)} tone="emerald" />
          <SplitCard
            label="Poveon keeps"
            value={naira(poveonShare)}
            tone={poveonShare < 0 ? "red" : "medical"}
          />
        </div>
        {poveonShare < 0 && (
          <p className="mt-2 text-xs font-semibold text-red-400">
            The doctor&apos;s share is more than the price — that can&apos;t be saved.
          </p>
        )}

        <p className="mt-4 rounded-lg bg-white/5 px-4 py-3 text-xs leading-relaxed text-slate-400">
          Each doctor&apos;s pool releases at{" "}
          <strong className="text-slate-200">
            {naira(Math.round(form.doctor_share_naira / Math.max(1, form.release_months)))}
          </strong>{" "}
          per member per month over {form.release_months} months.
        </p>

        <button
          onClick={save}
          disabled={saving || !dirty || poveonShare < 0}
          className="mt-4 flex items-center gap-2 rounded-lg bg-medical-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      <input
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white focus:border-medical-500 focus:outline-none"
      />
    </label>
  );
}

function SplitCard({ label, value, tone }: { label: string; value: string; tone: "slate" | "emerald" | "medical" | "red" }) {
  const tones = {
    slate: "border-white/10 bg-white/5 text-white",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    medical: "border-medical-500/30 bg-medical-500/10 text-medical-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="mt-1 text-xl font-extrabold">{value}</p>
    </div>
  );
}

// ── Payouts ─────────────────────────────────────────────────────────────────

function PayoutsPanel() {
  const [info, setInfo] = useState<ReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/consults/release", { cache: "no-store" });
      const d = await res.json();
      if (d.success) setInfo(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run() {
    if (running) return;
    if (!window.confirm("Release this month's instalment to every doctor with active members?")) return;
    setRunning(true);
    try {
      // The endpoint works in batches so a big month can't time out — keep
      // calling until it reports nothing left.
      let count = 0;
      let amount = 0;
      for (let pass = 0; pass < 50; pass++) {
        const res = await fetch("/api/admin/consults/release", { method: "POST" });
        const d = await res.json();
        if (!res.ok || !d.success) { toast.error(d.error ?? "Release failed."); return; }
        count += d.released_count;
        amount += d.released_amount;
        if (!d.remaining) break;
      }
      toast.success(
        count > 0
          ? `Released ${naira(amount)} across ${count} members`
          : "Nothing left to release this month"
      );
      load();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-sm font-bold text-white">Monthly release</h3>
        <p className="mt-1 text-xs text-slate-400">
          Moves one month&apos;s instalment of every doctor&apos;s pool from pending into their wallet.
          Running it twice in the same month does nothing the second time, and a member who has left is
          closed out instead of paid.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="rounded-lg bg-white/5 px-4 py-3">
            <p className="text-xs text-slate-400">Current period</p>
            <p className="text-lg font-bold text-white">{info?.period ?? "—"}</p>
          </div>
          <div className="rounded-lg bg-emerald-500/10 px-4 py-3">
            <p className="text-xs text-emerald-300/70">Released so far this period</p>
            <p className="text-lg font-bold text-emerald-300">{naira(info?.released_amount ?? 0)}</p>
          </div>
          <button
            onClick={run}
            disabled={running || loading}
            className="ml-auto flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Releasing…" : "Run release"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold text-white">This period, by doctor</h3>
        </div>
        {(info?.doctors.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            <Check className="mx-auto mb-2 h-8 w-8 text-slate-600" />
            Nothing released for {info?.period ?? "this period"} yet.
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {info!.doctors.map((d) => (
              <li key={d.doctor_email} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-slate-200">{d.doctor_email}</span>
                <span className="text-sm font-bold text-emerald-300">{naira(d.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
