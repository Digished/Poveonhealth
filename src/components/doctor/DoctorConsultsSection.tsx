"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, BadgeCheck, Banknote, CalendarDays, Check, HeartPulse,
  Loader2, MessageSquareText, Search, Send, Target, TrendingUp, Users, Wallet,
} from "lucide-react";
import { getJson, invalidateJson } from "@/lib/client-cache";
import type { ConsultView } from "@/components/doctor/consult-views";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const CONDITION_LABEL: Record<string, string> = { hypertension: "Hypertension", diabetes: "Diabetes" };

type Wallet = {
  active_patients: number; pool_total: number; released: number; pending: number;
  monthly_estimate: number; release_months: number; per_patient: number;
};
type Preferences = { accepting: boolean; patient_cap: number | null; default_cap: number; effective_cap: number };
type Payout = { period: string; amount: number; released_at: string };

type Overview = {
  wallet: Wallet;
  unread_messages: number;
  awaiting_assessment: number;
  preferences: Preferences;
  payouts: Payout[];
};

type MemberRow = {
  id: string; code: string; full_name: string; email: string; phone: string | null;
  conditions: string[]; goal: string | null; status: string; assigned_at: string | null;
  expires_at: string | null; messages_used: number; message_allowance: number;
  messages_left: number; unread: number; assessed: boolean;
  last_message: { sender: string; preview: string; created_at: string } | null;
};

type Message = { id: string; sender: string; body: string; created_at: string };

/** The detail endpoint returns the member's full record, not the list summary. */
type MemberDetailData = {
  patient: {
    id: string; code: string; full_name: string; email: string; phone: string | null;
    sex: string | null; date_of_birth: string | null; state: string | null; city: string | null;
    conditions: string[]; goal: string | null; goal_metric: string | null; status: string;
    assigned_at: string | null; subscribed_at: string | null; expires_at: string | null;
    messages_used: number; message_allowance: number; messages_left: number;
  };
  earning: { total: number; released: number; pending: number; status: string } | null;
  messages: Message[];
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function formatPeriod(period: string) {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/**
 * The doctor's care-plan workspace: what their pool is worth, who is in it, and
 * the asynchronous thread with each member.
 */
export function DoctorConsultsSection({
  view: viewProp,
  onViewChange,
}: {
  view?: ConsultView;
  onViewChange?: (view: ConsultView) => void;
}) {
  const [internalView, setInternalView] = useState<ConsultView>("overview");
  const view = viewProp ?? internalView;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const setView = useCallback((v: ConsultView) => {
    setInternalView(v);
    onViewChangeRef.current?.(v);
  }, []);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const d = await getJson<{ success: boolean } & Overview>("/api/doc-login/consults", { force });
      if (d.success) setOverview(d);
    } catch {
      /* non-blocking */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (openMemberId) {
    return (
      <MemberDetail
        id={openMemberId}
        onBack={() => { setOpenMemberId(null); invalidateJson("/api/doc-login/consults"); load(true); }}
      />
    );
  }

  return (
    <div className="animate-fade-in space-y-5">
      {view === "overview" && (
        <OverviewPanel
          overview={overview}
          loading={loading}
          onGoToMembers={() => setView("members")}
        />
      )}
      {view === "members" && <MembersPanel onOpen={setOpenMemberId} />}
      {view === "earnings" && <EarningsPanel overview={overview} loading={loading} />}
      {view === "intake" && (
        <IntakePanel
          preferences={overview?.preferences ?? null}
          activePatients={overview?.wallet.active_patients ?? 0}
          onSaved={(prefs) => setOverview((o) => (o ? { ...o, preferences: prefs } : o))}
        />
      )}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewPanel({
  overview, loading, onGoToMembers,
}: {
  overview: Overview | null; loading: boolean; onGoToMembers: () => void;
}) {
  const w = overview?.wallet;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          icon={Users}
          label="Members in your pool"
          value={loading ? "…" : String(w?.active_patients ?? 0)}
          accent="medical"
        />
        <Stat
          icon={Wallet}
          label="Released to you"
          value={loading ? "…" : naira(w?.released ?? 0)}
          accent="emerald"
        />
        <Stat
          icon={Banknote}
          label="Pending"
          value={loading ? "…" : naira(w?.pending ?? 0)}
          accent="amber"
        />
        <Stat
          icon={TrendingUp}
          label="Next month (estimate)"
          value={loading ? "…" : naira(w?.monthly_estimate ?? 0)}
          accent="slate"
        />
      </div>

      {/* What needs the doctor */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionCard
          tone={overview?.awaiting_assessment ? "amber" : "quiet"}
          icon={<AlertCircle className="h-5 w-5" />}
          count={overview?.awaiting_assessment ?? 0}
          title="Waiting for a first assessment"
          blurb="New members you haven't written to yet."
          onClick={onGoToMembers}
        />
        <ActionCard
          tone={overview?.unread_messages ? "medical" : "quiet"}
          icon={<MessageSquareText className="h-5 w-5" />}
          count={overview?.unread_messages ?? 0}
          title="Messages waiting on a reply"
          blurb="Members who wrote and haven't heard back."
          onClick={onGoToMembers}
        />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-800">How your care-plan pay works</h3>
        <ol className="mt-3 space-y-2.5 text-sm text-slate-600">
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-medical-50 text-xs font-bold text-medical-700">1</span>
            Every member assigned to you adds{" "}
            <strong className="text-slate-800">{naira(w?.per_patient ?? 6000)}</strong> to your pool.
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-medical-50 text-xs font-bold text-medical-700">2</span>
            The pool is released monthly, a{" "}
            <strong className="text-slate-800">{w?.release_months ?? 12}th</strong> at a time — that&apos;s the
            &ldquo;next month&rdquo; figure above.
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-medical-50 text-xs font-bold text-medical-700">3</span>
            If a member leaves, their remaining share leaves the pool with them, and your monthly figure
            adjusts.
          </li>
        </ol>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, accent,
}: {
  icon: typeof Users; label: string; value: string; accent: "medical" | "emerald" | "amber" | "slate";
}) {
  const tones = {
    medical: "bg-medical-50 text-medical-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
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

function ActionCard({
  tone, icon, count, title, blurb, onClick,
}: {
  tone: "amber" | "medical" | "quiet";
  icon: React.ReactNode; count: number; title: string; blurb: string; onClick: () => void;
}) {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100/70",
    medical: "border-medical-200 bg-medical-50 text-medical-700 hover:bg-medical-100/70",
    quiet: "border-slate-100 bg-white text-slate-400 hover:border-slate-200",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${tones[tone]}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs opacity-80">{blurb}</span>
      </span>
      <span className="shrink-0 text-2xl font-extrabold">{count}</span>
    </button>
  );
}

// ── Members ─────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "Needs first assessment" },
  { key: "needs_reply", label: "Waiting on you" },
  { key: "inactive", label: "Lapsed" },
] as const;

function MembersPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), filter });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/doc-login/consults/patients?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.success) return;
      setMembers((prev) => (append ? [...prev, ...data.patients] : data.patients));
      setTotal(data.total);
      setHasMore(data.has_more);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [q, filter]);

  // Debounced so typing in a 2,000-member pool doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => load(1, false), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email or care code…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40"
          />
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === f.key
                  ? "bg-medical-600 text-white shadow-sm shadow-medical-600/25"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-medical-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && members.length === 0 ? (
        <ListSkeleton />
      ) : members.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
          <HeartPulse className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-600">
            {filter === "all" ? "No members yet" : "Nothing in this list"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {filter === "all"
              ? "Members are assigned to you automatically as people join the care plan."
              : "Try another filter."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid items-start gap-3 xl:grid-cols-2">
            {members.map((m) => (
              <MemberCard key={m.id} member={m} onClick={() => onOpen(m.id)} />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Showing {members.length} of {total}</p>
            {hasMore && (
              <button
                onClick={() => load(page + 1, true)}
                disabled={loading}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-medical-200 disabled:opacity-50"
              >
                {loading ? "Loading…" : "Show more"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MemberCard({ member, onClick }: { member: MemberRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-medical-200 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-medical-50 text-sm font-bold text-medical-600">
          {member.full_name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-slate-800">{member.full_name}</span>
            {member.unread > 0 && (
              <span className="rounded-full bg-medical-600 px-2 py-0.5 text-[10px] font-bold text-white">
                {member.unread} new
              </span>
            )}
            {!member.assessed && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                Needs assessment
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{member.code}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {member.conditions.map((c) => (
              <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {CONDITION_LABEL[c] ?? c}
              </span>
            ))}
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-slate-400">
          {member.messages_left} left
        </span>
      </div>

      {member.goal && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="line-clamp-2">{member.goal}</span>
        </p>
      )}

      {member.last_message && (
        <p className="mt-2 truncate text-xs text-slate-500">
          <span className="font-semibold text-slate-600">
            {member.last_message.sender === "doctor" ? "You" : member.full_name.split(" ")[0]}:
          </span>{" "}
          {member.last_message.preview}
        </p>
      )}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="grid items-start gap-3 xl:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-slate-100" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── One member ──────────────────────────────────────────────────────────────

function MemberDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<MemberDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/doc-login/consults/patients/${id}`, { cache: "no-store" });
        const d = await res.json();
        if (!cancelled && d.success) setData(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages.length]);

  async function reply() {
    if (sending || body.trim().length < 2) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.error ?? "Could not send that reply."); return; }
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, d.message] } : prev));
      setBody("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <div className="h-64 animate-pulse rounded-2xl border border-slate-100 bg-white" />
      </div>
    );
  }

  const p = data.patient;

  return (
    <div className="animate-fade-in space-y-4">
      <BackButton onBack={onBack} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_1fr]">
        {/* Who they are */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-medical-50 text-lg font-bold text-medical-600">
                {p.full_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900">{p.full_name}</p>
                <p className="font-mono text-xs text-slate-400">{p.code}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.conditions.map((c) => (
                <span key={c} className="rounded-full bg-medical-50 px-2.5 py-0.5 text-[11px] font-semibold text-medical-700">
                  {CONDITION_LABEL[c] ?? c}
                </span>
              ))}
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <DetailRow label="Email" value={p.email} />
              {p.phone && <DetailRow label="Phone" value={p.phone} />}
              {p.sex && <DetailRow label="Sex" value={p.sex} />}
              {p.date_of_birth && <DetailRow label="Born" value={formatDate(p.date_of_birth)} />}
              {(p.city || p.state) && <DetailRow label="Location" value={[p.city, p.state].filter(Boolean).join(", ")} />}
              <DetailRow label="Joined" value={formatDate(p.subscribed_at)} />
              <DetailRow label="Renews" value={formatDate(p.expires_at)} />
              <DetailRow label="Messages" value={`${p.messages_used} of ${p.message_allowance} used`} />
            </dl>
          </div>

          {p.goal && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                <Target className="h-3.5 w-3.5" />
                Their goal this year
              </h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-emerald-900">{p.goal}</p>
              {p.goal_metric && <p className="mt-1.5 text-xs text-emerald-700/80">Measured by: {p.goal_metric}</p>}
            </div>
          )}

          {data.earning && (
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Your pay for this member</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-lg font-extrabold text-emerald-600">{naira(data.earning.released)}</p>
                  <p className="text-[11px] text-slate-400">Released</p>
                </div>
                <div>
                  <p className="text-lg font-extrabold text-amber-600">{naira(data.earning.pending)}</p>
                  <p className="text-[11px] text-slate-400">Pending</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Thread */}
        <div className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <MessageSquareText className="h-4 w-4 text-medical-500" />
            <h3 className="text-sm font-bold text-slate-800">Conversation</h3>
            <span className="ml-auto text-xs text-slate-400">
              {data.messages.length} message{data.messages.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
            {data.messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
                <BadgeCheck className="h-10 w-10 text-slate-200" />
                <p className="text-sm font-semibold text-slate-500">No messages yet</p>
                <p className="max-w-xs text-xs text-slate-400">
                  Send a first assessment against their goal — it&apos;s what they joined for.
                </p>
              </div>
            ) : (
              data.messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender === "doctor" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      m.sender === "doctor"
                        ? "rounded-br-md bg-medical-600 text-white"
                        : "rounded-bl-md border border-slate-100 bg-white text-slate-700"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${m.sender === "doctor" ? "text-white/60" : "text-slate-400"}`}>
                      <CalendarDays className="mr-1 inline h-3 w-3" />
                      {formatWhen(m.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={3}
                maxLength={6000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your assessment or reply…"
                className="flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40"
              />
              <button
                onClick={reply}
                disabled={sending || body.trim().length < 2}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-medical-600 text-white transition hover:bg-medical-700 disabled:opacity-40"
                aria-label="Send reply"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Your replies don&apos;t use the member&apos;s allowance — write as often as the case needs.
            </p>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to members
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm font-medium capitalize text-slate-700">{value}</dd>
    </div>
  );
}

// ── Earnings ────────────────────────────────────────────────────────────────

function EarningsPanel({ overview, loading }: { overview: Overview | null; loading: boolean }) {
  const w = overview?.wallet;
  const payouts = overview?.payouts ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:max-w-3xl">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">In your wallet</p>
          <p className="mt-1 text-3xl font-extrabold text-emerald-700">{loading ? "…" : naira(w?.released ?? 0)}</p>
          <p className="mt-1 text-xs text-emerald-700/80">Released across all your members.</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Still pending</p>
          <p className="mt-1 text-3xl font-extrabold text-amber-700">{loading ? "…" : naira(w?.pending ?? 0)}</p>
          <p className="mt-1 text-xs text-amber-700/80">
            Releases at about {naira(w?.monthly_estimate ?? 0)} a month.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-800">Monthly releases</h3>
        </div>
        {payouts.length === 0 ? (
          <div className="p-8 text-center">
            <Banknote className="mx-auto mb-3 h-10 w-10 text-slate-200" />
            <p className="text-sm font-semibold text-slate-600">Nothing released yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Your first instalment lands at the end of the month after a member joins.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {payouts.map((p) => (
              <li key={p.period} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{formatPeriod(p.period)}</p>
                  <p className="text-xs text-slate-400">Released {formatDate(p.released_at)}</p>
                </div>
                <span className="text-sm font-bold text-emerald-600">{naira(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
        Your pool is worth {naira(w?.pool_total ?? 0)} in total across {w?.active_patients ?? 0} member
        {w?.active_patients === 1 ? "" : "s"}, at {naira(w?.per_patient ?? 6000)} each. Instalments follow
        your bank&apos;s settlement schedule once released.
      </p>
    </div>
  );
}

// ── Intake preferences ──────────────────────────────────────────────────────

function IntakePanel({
  preferences, activePatients, onSaved,
}: {
  preferences: Preferences | null;
  activePatients: number;
  onSaved: (prefs: Preferences) => void;
}) {
  const [accepting, setAccepting] = useState(preferences?.accepting ?? true);
  const [cap, setCap] = useState(String(preferences?.patient_cap ?? ""));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!preferences) return;
    setAccepting(preferences.accepting);
    setCap(String(preferences.patient_cap ?? ""));
  }, [preferences]);

  const effectiveCap = cap.trim() ? Number(cap) : preferences?.default_cap ?? 200;
  const full = activePatients >= effectiveCap;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/doc-login/consults/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepting, patient_cap: cap.trim() ? Number(cap) : null }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { setError(d.error ?? "Could not save that."); return; }
      invalidateJson("/api/doc-login/consults");
      onSaved(d.preferences);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 xl:max-w-2xl">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">How many members will you take?</h3>
        <p className="mt-1 text-sm text-slate-500">
          New members are shared out to whoever is carrying the fewest — so your cap is what stops the
          pool growing past what you can manage.
        </p>

        <div className="mt-5 space-y-4">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
            <button
              type="button"
              role="switch"
              aria-checked={accepting}
              onClick={() => setAccepting((v) => !v)}
              className={`mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition ${
                accepting ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  accepting ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                {accepting ? "Taking new members" : "Paused — not taking new members"}
              </span>
              <span className="block text-xs text-slate-500">
                Pause any time. Members already assigned to you stay with you.
              </span>
            </span>
          </label>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Members per year
              <span className="ml-2 text-xs font-normal text-slate-400">
                leave blank for the platform default ({preferences?.default_cap ?? 200})
              </span>
            </label>
            <input
              inputMode="numeric"
              value={cap}
              onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={String(preferences?.default_cap ?? 200)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40"
            />
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Currently carrying</span>
              <span className="font-bold text-slate-800">
                {activePatients} of {effectiveCap}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all ${full ? "bg-amber-400" : "bg-medical-500"}`}
                style={{ width: `${Math.min(100, effectiveCap ? (activePatients / effectiveCap) * 100 : 0)}%` }}
              />
            </div>
            {full && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                You&apos;re at your cap — new members will go to other doctors until you raise it.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-3 text-sm font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saved ? "Saved" : "Save preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
