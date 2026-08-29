"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import {
  Banknote, Check, HeartPulse, Loader2, Play, RefreshCw, Save, Search,
  Settings2, TrendingUp, Users, UserCog,
} from "lucide-react";

type Settings = {
  price_naira: number;
  doctor_share_naira: number;
  message_allowance: number;
  release_months: number;
  default_doctor_cap: number;
  lab_discount_percent: number;
  pharmacy_discount_percent: number;
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

type SubTab = "members" | "pricing" | "payouts";

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

      <div className="flex gap-1 rounded-xl bg-white/5 p-1">
        {([
          ["members", "Members", Users],
          ["pricing", "Pricing", Settings2],
          ["payouts", "Doctor payouts", Banknote],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              subTab === key ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {subTab === "members" && <MembersPanel />}
      {subTab === "pricing" && <PricingPanel />}
      {subTab === "payouts" && <PayoutsPanel />}
    </div>
  );
}

// ── Members ─────────────────────────────────────────────────────────────────

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

  async function reassign(member: Member) {
    const next = window.prompt(
      `Assign ${member.full_name} to which doctor? (email, or leave blank to unassign)`,
      member.doctor_email ?? ""
    );
    if (next === null) return;
    setAssigning(member.id);
    try {
      const res = await fetch("/api/admin/consults/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: member.id, doctor_email: next.trim() || null }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not reassign."); return; }
      toast.success("Member reassigned");
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
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
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
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{m.full_name}</p>
                    <p className="text-xs text-slate-400">{m.email}</p>
                    <p className="font-mono text-[11px] text-slate-500">{m.code}</p>
                  </td>
                  <td className="px-4 py-3 text-xs capitalize text-slate-300">{m.conditions.join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    {m.doctor_email ?? <span className="text-amber-400">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {m.messages_used}/{m.message_allowance}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">{m.amount_paid ? naira(m.amount_paid) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatDate(m.expires_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[m.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {m.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => reassign(m)}
                      disabled={assigning === m.id}
                      className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/20 disabled:opacity-50"
                    >
                      {assigning === m.id ? "…" : "Reassign"}
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
