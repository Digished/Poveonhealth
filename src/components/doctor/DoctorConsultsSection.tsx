"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  ChevronDown,
  HeartPulse,
  Info,
  Loader2,
  MessageSquareText,
  Plus,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { getJson, invalidateJson, peekJson } from "@/lib/client-cache";
import type { ConsultView } from "@/components/doctor/consult-views";
import { DoctorCredentialsPanel } from "@/components/doctor/DoctorCredentialsPanel";
import {
  CANCEL_REASON_LABEL,
  FULFILMENT_LABEL,
  CarePlanOrders,
  type Prescription,
  type TestOrder,
} from "@/components/doctor/CarePlanOrders";
import { CarePlanTreatment, type TreatmentPlan } from "@/components/doctor/CarePlanTreatment";
import { ScreeningHistory, type ScreeningRound } from "@/components/doctor/ScreeningHistory";
import { ADHERENCE_LABEL, bpBand, durationLabel } from "@/components/consults/baseline";
import { CONDITIONS as CONDITION_OPTIONS, CONDITION_LABEL } from "@/lib/consult-conditions";
import { Modal } from "@/components/ui/Overlay";
import { MonthFilter, monthKey, monthsFrom } from "@/components/ui/MonthFilter";
import { describeLog } from "@/lib/treatment-plan";
import { RISK_LABEL, effectiveRisk } from "@/lib/care-risk";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
type Redemption = {
  id: string;
  kind: string;
  description: string | null;
  pharmacy_name: string | null;
  discount_naira: number;
  created_at: string;
};

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
  approved: boolean;
};

type MemberRow = {
  id: string; code: string; full_name: string; email: string; phone: string | null;
  conditions: string[]; status: string; assigned_at: string | null;
  expires_at: string | null; messages_used: number; message_allowance: number;
  messages_left: number; unread: number; assessed: boolean;
  /** The level to act on — the doctor's own call when they made one. */
  risk?: string; risk_manual?: boolean; risk_detail?: string | null;
  last_message: { sender: string; preview: string; created_at: string } | null;
};

const RISK_CHIP: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-700",
  watch: "bg-sky-100 text-sky-700",
};

/** What the member told us about themselves before they paid. */
type Baseline = {
  medications: string | null;
  adherence: string | null;
  hypertension_years: number | null;
  diabetes_years: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  bp_taken_on: string | null;
  glucose_mg_dl: number | null;
  glucose_context: string | null;
  glucose_taken_on: string | null;
  notes: string | null;
  captured_at: string | null;
};

/** The detail endpoint returns the member's full record, not the list summary. */
type MemberDetailData = {
  patient: {
    id: string; code: string | null; full_name: string; email: string; phone: string | null;
    sex: string | null; date_of_birth: string | null; state: string | null; city: string | null;
    conditions: string[]; status: string;
    assigned_at: string | null; subscribed_at: string | null; expires_at: string | null;
    messages_used: number; message_allowance: number; messages_left: number;
    // Only the age is clinically useful, and it is what the doctor asks for.
    age: number | null;
    share_history: boolean;
    previous_doctors: string[];
    risk_level: string;
    risk_reason: string | null;
    risk_rated_at: string | null;
    risk_manual: string | null;
    risk_note: string | null;
  };
  baseline: Baseline | null;
  earning: { total: number; released: number; pending: number; status: string } | null;
  prescriptions: Prescription[];
  test_orders: TestOrder[];
  redemptions: Redemption[];
  plan: TreatmentPlan | null;
  plan_logs: PlanLog[];
  screenings: ScreeningRound[];
  history_withheld: boolean;
};

/** One thing the member recorded against their plan. */
type PlanLog = {
  id: string;
  item_id: string;
  item_label: string;
  measure: string;
  measure_label: string | null;
  note: string | null;
  systolic: number | null;
  diastolic: number | null;
  glucose_mg_dl: number | null;
  weight_kg: number | null;
  value_number: number | null;
  value_text: string | null;
  logged_for: string;
  created_at: string;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
  focusMemberId,
  onFocusHandled,
  onMemberOpenChange,
}: {
  view?: ConsultView;
  onViewChange?: (view: ConsultView) => void;
  /** A member the chat button asked us to open. */
  focusMemberId?: string | null;
  onFocusHandled?: () => void;
  /** Lets the shell hide its sub-menu while a record is open. */
  onMemberOpenChange?: (id: string | null) => void;
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

  // Tell the shell what is open, so it can drop the sub-menu strip.
  const openChangeRef = useRef(onMemberOpenChange);
  openChangeRef.current = onMemberOpenChange;
  useEffect(() => { openChangeRef.current?.(openMemberId); }, [openMemberId]);
  useEffect(() => () => { openChangeRef.current?.(null); }, []);

  // Arriving from the chat button: open that member's record.
  const focusHandledRef = useRef(onFocusHandled);
  focusHandledRef.current = onFocusHandled;
  useEffect(() => {
    if (!focusMemberId) return;
    setOpenMemberId(focusMemberId);
    focusHandledRef.current?.();
  }, [focusMemberId]);

  if (openMemberId) {
    return (
      <MemberDetail
        id={openMemberId}
        canPrescribe={!!overview?.approved}
        onBack={() => {
          setOpenMemberId(null);
          // A risk change or a new order made in there should show in the list.
          invalidateJson("/api/doc-login/consults");
          invalidateJson("/api/doc-login/consults/patients?page=1&filter=all");
          load(true);
        }}
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
          onGoToCredentials={() => setView("credentials")}
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
      {view === "credentials" && (
        <DoctorCredentialsPanel
          onApproved={(approved) => setOverview((o) => (o ? { ...o, approved } : o))}
        />
      )}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewPanel({
  overview, loading, onGoToMembers, onGoToCredentials,
}: {
  overview: Overview | null;
  loading: boolean;
  onGoToMembers: () => void;
  onGoToCredentials: () => void;
}) {
  const w = overview?.wallet;
  const notApproved = !loading && overview != null && !overview.approved;

  return (
    <div className="space-y-4">
      {/* Nothing else on this panel means anything until they're cleared, so
          the invitation comes first. */}
      {notApproved && (
        <button
          type="button"
          onClick={onGoToCredentials}
          className="group flex w-full items-center gap-4 rounded-2xl bg-gradient-to-br from-medical-600 to-medical-800 p-4 text-left text-white shadow-lg shadow-medical-600/20 transition hover:shadow-xl sm:p-5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold sm:text-base">Join the care-plan network</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-white/80 sm:text-sm">
              Members are only assigned to doctors we&apos;ve verified. Send us your MDCN number and
              practising licence — it takes a couple of minutes.
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-medical-700 transition group-hover:bg-medical-50 sm:inline-flex">
            Apply
            <ArrowRight className="h-4 w-4" />
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-white/70 sm:hidden" />
        </button>
      )}

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

      {/* A collapsible note rather than three stacked paragraphs — on a phone
          the open version filled most of the screen for something you read
          once. */}
      <details className="group rounded-2xl border border-slate-100 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-bold text-slate-800">
          <Info className="h-4 w-4 shrink-0 text-medical-500" />
          How your care-plan pay works
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
          <PayNote term="Per member">
            Each member assigned to you adds{" "}
            <strong className="text-slate-800">{naira(w?.per_patient ?? 6000)}</strong> to your pool.
          </PayNote>
          <PayNote term="Paid monthly">
            A {w?.release_months ?? 12}th of the pool is released each month — the &ldquo;next
            month&rdquo; figure above.
          </PayNote>
          <PayNote term="If someone leaves">
            Their unreleased share leaves with them and your monthly figure adjusts.
          </PayNote>
        </dl>
      </details>
    </div>
  );
}

function PayNote({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{term}</dt>
      <dd className="mt-0.5 text-sm leading-relaxed text-slate-600">{children}</dd>
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
  // Triage first: in a list of hundreds this is the one you reach for.
  { key: "critical", label: "Needs attention now" },
  { key: "flagged", label: "All flagged" },
  { key: "new", label: "Needs first assessment" },
  { key: "needs_reply", label: "Waiting on you" },
  { key: "inactive", label: "Lapsed" },
] as const;

function MembersPanel({ onOpen }: { onOpen: (id: string) => void }) {
  // Paint from the last good response if it is still fresh, so coming back to
  // this tab shows the list immediately rather than a skeleton.
  const cached = peekJson<{ patients: MemberRow[]; total: number; has_more: boolean }>(
    "/api/doc-login/consults/patients?page=1&filter=all",
    20_000
  );
  const [members, setMembers] = useState<MemberRow[]>(cached?.patients ?? []);
  const [total, setTotal] = useState(cached?.total ?? 0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(cached?.has_more ?? false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(!cached);

  /**
   * Two things made this feel slow on every visit, neither of them the query:
   * it bypassed the client cache, so leaving the tab and coming back always
   * went to the network; and it blanked the list to a skeleton while doing so,
   * so a fast refresh still looked like a cold load.
   *
   * Now it serves the cached page immediately and refreshes behind it.
   */
  const load = useCallback(async (nextPage: number, append: boolean, force = false) => {
    const params = new URLSearchParams({ page: String(nextPage), filter });
    if (q.trim()) params.set("q", q.trim());
    const url = `/api/doc-login/consults/patients?${params}`;

    setLoading(true);
    try {
      const data = await getJson<{
        success: boolean;
        patients: MemberRow[];
        total: number;
        has_more: boolean;
      }>(url, { force, ttlMs: 20_000 });
      if (!data.success) return;
      setMembers((prev) => (append ? [...prev, ...data.patients] : data.patients));
      setTotal(data.total);
      setHasMore(data.has_more);
      setPage(nextPage);
    } catch {
      /* leave the last good list on screen */
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
            {/* Triage first: in a list of hundreds this is what you scan for. */}
            {member.risk && member.risk !== "none" && (
              <span
                title={member.risk_detail ?? undefined}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  RISK_CHIP[member.risk] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {member.risk === "critical" && <AlertCircle className="h-3 w-3" />}
                {RISK_LABEL[member.risk] ?? member.risk}
                {/* A dot means a person decided this, not a threshold. */}
                {member.risk_manual && <span className="opacity-60">·</span>}
              </span>
            )}
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

      {member.last_message && (
        <p className="mt-3 truncate text-xs text-slate-500">
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

/**
 * What the member reported when they signed up — their starting point, so the
 * doctor sees where they were before the plan began.
 */
const BP_TONE: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-500",
};

function BaselineCard({ baseline, conditions }: { baseline: Baseline | null; conditions: string[] }) {
  if (!baseline) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Baseline</h3>
        <p className="mt-2">
          This member joined before we started asking baseline questions. Ask them in the thread for
          their current medications and latest readings.
        </p>
      </div>
    );
  }

  const band = bpBand(baseline.bp_systolic, baseline.bp_diastolic);
  const hasBp = baseline.bp_systolic != null && baseline.bp_diastolic != null;
  const glucoseContext =
    baseline.glucose_context === "fasting" ? "fasting" : baseline.glucose_context === "random" ? "random" : null;
  const hypertension = conditions.includes("hypertension");
  const diabetes = conditions.includes("diabetes");

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Baseline</h3>
        {baseline.captured_at && (
          <span className="text-[11px] text-slate-400">{formatDate(baseline.captured_at)}</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Blood pressure</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">
            {hasBp ? `${baseline.bp_systolic}/${baseline.bp_diastolic}` : "Not given"}
          </p>
          {hasBp && (
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${BP_TONE[band.tone]}`}>
              {band.label}
            </span>
          )}
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Blood sugar</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">
            {baseline.glucose_mg_dl != null ? `${baseline.glucose_mg_dl}` : "Not given"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {baseline.glucose_mg_dl != null ? `mg/dL${glucoseContext ? ` · ${glucoseContext}` : ""}` : "\u00a0"}
          </p>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 text-sm">
        <DetailRow label="Takes medication" value={ADHERENCE_LABEL[baseline.adherence ?? ""] ?? "Not given"} />
        {hypertension && (
          <DetailRow label="Hypertension for" value={durationLabel(baseline.hypertension_years) ?? "Not given"} />
        )}
        {diabetes && <DetailRow label="Diabetes for" value={durationLabel(baseline.diabetes_years) ?? "Not given"} />}
      </dl>

      {baseline.medications && (
        <div className="mt-3 rounded-xl bg-medical-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-medical-700">Current medication</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{baseline.medications}</p>
        </div>
      )}

      {baseline.notes && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">In their words</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{baseline.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── One member ──────────────────────────────────────────────────────────────

function MemberDetail({
  id, canPrescribe, onBack,
}: {
  id: string; canPrescribe: boolean; onBack: () => void;
}) {
  const [data, setData] = useState<MemberDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"care" | "record">("care");
  const [showProfile, setShowProfile] = useState(false);
  const [editingConditions, setEditingConditions] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/doc-login/consults/patients/${id}`, { cache: "no-store" });
    const d = await res.json();
    if (d.success) setData(d);
  }, [id]);

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

      <RiskBanner patient={p} onChanged={reload} />

      {/* Who they are, in a line. Everything else is a tap away rather than
          three cards of scrolling before the clinical picture. */}
      <button
        onClick={() => setShowProfile(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-medical-200"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-medical-50 text-base font-bold text-medical-600">
          {p.full_name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-slate-900">{p.full_name}</span>
          <span className="block truncate text-xs text-slate-500">
            {[p.age != null ? `${p.age} years` : null, p.sex, p.code].filter(Boolean).join(" · ")}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-slate-300" />
      </button>

      <div className="flex flex-wrap items-center gap-1.5">
        {p.conditions.map((c) => (
          <span key={c} className="rounded-full bg-medical-50 px-2.5 py-0.5 text-[11px] font-semibold text-medical-700">
            {CONDITION_LABEL[c] ?? c}
          </span>
        ))}
        {canPrescribe && (
          <button
            onClick={() => setEditingConditions(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:border-medical-300 hover:text-medical-700"
          >
            <Plus className="h-3 w-3" /> Condition
          </button>
        )}
      </div>

      {/* Two places to be: today's care, and the record behind it. */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {([["care", "Care"], ["record", "Pay & record"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "care" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <BaselineCard baseline={data.baseline} conditions={p.conditions} />
            <ScreeningHistory rounds={data.screenings ?? []} />
            <DailyLog logs={data.plan_logs ?? []} />
            <CarePlanTreatment
              patientId={p.id}
              plan={data.plan}
              canEdit={canPrescribe}
              onChanged={reload}
            />
          </div>
          <div className="space-y-4">
            <CarePlanOrders
              patientId={p.id}
              prescriptions={data.prescriptions ?? []}
              testOrders={data.test_orders ?? []}
              canPrescribe={canPrescribe}
              onChanged={reload}
            />
            {canPrescribe && <NotifyCard patientId={p.id} plan={data.plan} />}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <ProfileCard patient={p} />
            {data.history_withheld && (
              <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                This member asked us not to pass on their earlier history, so you are seeing their
                record from the day they were assigned to you.
              </p>
            )}
          </div>
          <div className="space-y-4">
            {data.earning && (
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Your pay for this member
                </h3>
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
            <CareHistory
              prescriptions={data.prescriptions ?? []}
              testOrders={data.test_orders ?? []}
              redemptions={data.redemptions ?? []}
              plan={data.plan}
              planLogs={data.plan_logs ?? []}
            />
          </div>
        </div>
      )}

      {showProfile && <ProfileModal patient={p} onClose={() => setShowProfile(false)} />}

      {editingConditions && (
        <ConditionsDialog
          patientId={p.id}
          current={p.conditions}
          onClose={() => setEditingConditions(false)}
          onSaved={() => { setEditingConditions(false); reload(); }}
        />
      )}
    </div>
  );
}

/**
 * The member's own log, newest first.
 *
 * Grouped by day rather than listed flat: what a doctor scans for is "what did
 * this week look like", not a stream of individual entries.
 */
function DailyLog({ logs }: { logs: PlanLog[] }) {
  const [month, setMonth] = useState("");
  const months = monthsFrom(logs.map((l) => l.logged_for));
  const shown = month ? logs.filter((l) => monthKey(l.logged_for) === month) : logs;

  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Daily log</h3>
        <p className="mt-2 text-sm text-slate-500">
          Nothing logged yet. Items on their plan that ask for a reading — blood pressure, sugar,
          weight — show up here as they record them.
        </p>
      </div>
    );
  }

  const byDay = new Map<string, PlanLog[]>();
  for (const l of shown) {
    const key = new Date(l.logged_for).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(l);
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Daily log</h3>
        <span className="text-[11px] text-slate-400">{shown.length} entries</span>
      </div>

      <MonthFilter
        months={months}
        value={month}
        onChange={setMonth}
        allLabel="All"
        allCount={logs.length}
        className="mt-2"
      />

      <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
        {Array.from(byDay.entries()).slice(0, 30).map(([day, entries]) => (
          <div key={day}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {new Date(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
            </p>
            <ul className="mt-1 space-y-1">
              {entries.map((l) => (
                <li key={l.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-700">{l.item_label}</p>
                  <p className="text-[11px] text-slate-500">{describeLog(l)}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Where this member stands, and the doctor's chance to disagree.
 *
 * The automatic rating is a prompt to look, never a verdict — so the doctor
 * can set their own level in either direction, or clear it and hand the member
 * back to the thresholds.
 */
function RiskBanner({
  patient, onChanged,
}: {
  patient: MemberDetailData["patient"];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(patient.risk_note ?? "");

  const { level, manual } = effectiveRisk({
    risk_level: patient.risk_level,
    risk_manual: patient.risk_manual,
  });
  const detail = manual
    ? patient.risk_note || "Set by you"
    : patient.risk_reason ?? "A recent reading was outside the usual range.";

  async function save(next: string | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patient.id}/risk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: next, note: note.trim() || null }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save that."); return; }
      toast.success(next ? `Marked ${RISK_LABEL[next]?.toLowerCase() ?? next}` : "Back to automatic");
      setOpen(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  const tone =
    level === "critical" ? { box: "border-red-200 bg-red-50", icon: "text-red-500", head: "text-red-800", body: "text-red-700" }
    : level === "high" ? { box: "border-amber-200 bg-amber-50", icon: "text-amber-500", head: "text-amber-800", body: "text-amber-700" }
    : level === "watch" ? { box: "border-sky-200 bg-sky-50", icon: "text-sky-500", head: "text-sky-800", body: "text-sky-700" }
    : { box: "border-slate-200 bg-white", icon: "text-slate-400", head: "text-slate-700", body: "text-slate-500" };

  return (
    <>
      <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 ${tone.box}`}>
        <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${tone.head}`}>
            {RISK_LABEL[level] ?? level}
            {manual && <span className="ml-1.5 text-[11px] font-normal opacity-70">· your call</span>}
          </p>
          <p className={`text-xs ${tone.body}`}>
            {detail}
            {!manual && patient.risk_rated_at ? ` · ${formatDate(patient.risk_rated_at)}` : ""}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg bg-white/70 px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-white"
        >
          Change
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="How is this member doing?"
        subtitle="Your judgement overrides the automatic rating, in either direction."
        footer={
          <button
            onClick={() => save(null)}
            disabled={saving || !patient.risk_manual}
            className="w-full rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 transition hover:text-slate-700 disabled:opacity-40"
          >
            Clear my rating and go back to automatic
          </button>
        }
      >
        <div className="space-y-1.5">
          {(["critical", "high", "watch", "none"] as const).map((k) => (
            <button
              key={k}
              onClick={() => save(k)}
              disabled={saving}
              className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition disabled:opacity-50 ${
                patient.risk_manual === k
                  ? "border-medical-500 bg-medical-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="text-sm font-semibold text-slate-800">{RISK_LABEL[k]}</span>
              {patient.risk_manual === k && <Check className="h-4 w-4 text-medical-600" />}
            </button>
          ))}
        </div>

        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why? (optional — you'll see this on their record)"
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-medical-400"
        />
        <p className="mt-2 text-[11px] text-slate-400">
          The automatic rating currently says{" "}
          <strong>{(RISK_LABEL[patient.risk_level] ?? patient.risk_level).toLowerCase()}</strong>
          {patient.risk_reason ? ` — ${patient.risk_reason}` : ""}.
        </p>
      </Modal>
    </>
  );
}

/** Everything about the person, for when the doctor actually wants it. */
function ProfileCard({ patient }: { patient: MemberDetailData["patient"] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Full profile</h3>
      <dl className="mt-3 space-y-1.5 text-sm">
        <DetailRow label="Name" value={patient.full_name} />
        <DetailRow label="Code" value={patient.code ?? "—"} />
        <DetailRow label="Email" value={patient.email} />
        {patient.phone && <DetailRow label="Phone" value={patient.phone} />}
        {patient.sex && <DetailRow label="Sex" value={patient.sex} caps />}
        {patient.age != null && <DetailRow label="Age" value={`${patient.age} years`} />}
        {(patient.city || patient.state) && (
          <DetailRow label="Location" value={[patient.city, patient.state].filter(Boolean).join(", ")} />
        )}
        <DetailRow label="Joined" value={formatDate(patient.subscribed_at)} />
        <DetailRow label="Renews" value={formatDate(patient.expires_at)} />
        <DetailRow label="Messages" value={`${patient.messages_used} of ${patient.message_allowance} used`} />
        {patient.previous_doctors.length > 0 && (
          <DetailRow label="Previously" value={patient.previous_doctors.join(", ")} />
        )}
      </dl>
    </div>
  );
}

function ProfileModal({
  patient, onClose,
}: {
  patient: MemberDetailData["patient"];
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title={patient.full_name} subtitle={patient.code ?? "No code yet"}>
      <dl className="space-y-1.5 text-sm">
          <DetailRow label="Email" value={patient.email} />
          {patient.phone && <DetailRow label="Phone" value={patient.phone} />}
          {patient.sex && <DetailRow label="Sex" value={patient.sex} caps />}
          {patient.age != null && <DetailRow label="Age" value={`${patient.age} years`} />}
          {(patient.city || patient.state) && (
            <DetailRow label="Location" value={[patient.city, patient.state].filter(Boolean).join(", ")} />
          )}
          <DetailRow label="Joined" value={formatDate(patient.subscribed_at)} />
          <DetailRow label="Renews" value={formatDate(patient.expires_at)} />
        <DetailRow label="Messages" value={`${patient.messages_used} of ${patient.message_allowance} used`} />
      </dl>
    </Modal>
  );
}

/** What has actually happened for this member, oldest concerns last. */
type HistoryEntry = {
  when: string | null;
  title: string;
  detail: string;
  tone: "good" | "bad" | "reading" | "plain";
};

const HISTORY_DOT: Record<HistoryEntry["tone"], string> = {
  good: "bg-emerald-500",
  bad: "bg-red-400",
  reading: "bg-sky-400",
  plain: "bg-slate-300",
};

const HISTORY_TEXT: Record<HistoryEntry["tone"], string> = {
  good: "text-emerald-700",
  bad: "text-red-600",
  reading: "text-sky-700",
  plain: "text-slate-400",
};

function CareHistory({
  prescriptions, testOrders, redemptions, plan, planLogs,
}: {
  prescriptions: Prescription[];
  testOrders: TestOrder[];
  redemptions: Redemption[];
  plan: TreatmentPlan | null;
  planLogs: PlanLog[];
}) {
  const [month, setMonth] = useState("");

  const entries: HistoryEntry[] = [
    ...testOrders.map((t) => ({
      when: t.completed_at ?? t.due_date ?? null,
      title: t.tests,
      detail: t.status === "done" ? "Test done" : t.status === "cancelled" ? "Test cancelled" : "Test scheduled",
      tone: t.status === "done" ? ("good" as const) : ("plain" as const),
    })),
    // What a partner reported is the part that says it actually happened, so
    // it gets its own entry rather than a footnote on the order.
    ...testOrders.flatMap((t) =>
      (t.fulfilments ?? []).map((f) => ({
        when: f.created_at,
        title: t.tests,
        detail: `${FULFILMENT_LABEL[f.status] ?? f.status}${f.recorded_by ? ` at ${f.recorded_by}` : ""}`,
        tone: f.status === "done" ? ("good" as const) : ("bad" as const),
      }))
    ),
    ...prescriptions.map((m) => ({
      when: m.start_date,
      title: m.medication,
      detail:
        m.status === "cancelled"
          ? `Stopped — ${CANCEL_REASON_LABEL[m.cancel_reason ?? ""] ?? "no reason given"}`
          : m.status === "completed"
            ? "Course completed"
            : "Medication scheduled",
      tone: "plain" as const,
    })),
    ...prescriptions.flatMap((m) =>
      (m.fulfilments ?? []).map((f) => ({
        when: f.created_at,
        title: m.medication,
        detail: `${FULFILMENT_LABEL[f.status] ?? f.status}${f.recorded_by ? ` at ${f.recorded_by}` : ""}`,
        tone:
          f.status === "collected" || f.status === "done" ? ("good" as const) : ("bad" as const),
      }))
    ),
    // Every reading the member logged against their plan.
    ...planLogs.map((l) => ({
      when: l.logged_for,
      title: l.item_label,
      detail: describeLog(l),
      tone: "reading" as const,
    })),
    ...redemptions.map((r) => ({
      when: r.created_at,
      title: r.description ?? (r.kind === "pharmacy" ? "Pharmacy visit" : "Lab visit"),
      detail: `${naira(r.discount_naira)} off${r.pharmacy_name ? ` at ${r.pharmacy_name}` : ""}`,
      tone: "plain" as const,
    })),
    // The plan belongs in the record too: what they were asked to do, and how
    // much of it they have actually been doing.
    ...(plan
      ? [
          {
            when: plan.updated_at,
            title: plan.title,
            detail: `Plan set — ${plan.items.length} item${plan.items.length === 1 ? "" : "s"}`,
            tone: "plain" as const,
          },
        ]
      : []),
  ]
    .filter((e) => e.when)
    .sort((a, b) => new Date(b.when!).getTime() - new Date(a.when!).getTime());

  const months = monthsFrom(entries.map((e) => e.when));
  const shown = (month ? entries.filter((e) => monthKey(e.when) === month) : entries).slice(0, 60);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">History of care</h3>

      <MonthFilter
        months={months}
        value={month}
        onChange={setMonth}
        allLabel="All"
        allCount={entries.length}
        className="mt-2"
      />

      {shown.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          {month ? "Nothing that month." : "Nothing has happened yet."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {shown.map((e, i) => (
            <li key={`${e.title}-${i}`} className="flex gap-3">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${HISTORY_DOT[e.tone]}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{e.title}</p>
                <p className="text-[11px]">
                  <span className={HISTORY_TEXT[e.tone]}>{e.detail}</span>
                  <span className="text-slate-400"> · {formatDate(e.when)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One message when the schedule is set, instead of an email per entry. */
function NotifyCard({ patientId, plan }: { patientId: string; plan: TreatmentPlan | null }) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(plan?.notified_at ?? null);

  async function send() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patientId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: note.trim() || null }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not send that."); return; }
      toast.success("The member has been told");
      setNote("");
      setSentAt(new Date().toISOString());
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
        <Send className="h-4 w-4 text-medical-500" /> Tell them what&apos;s next
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Scheduling sends nothing on its own. Finish setting things up, then send one message covering
        all of it.
      </p>
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note in your own words (optional)"
        className="mt-2.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-medical-400"
      />
      <button
        onClick={send}
        disabled={sending}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-medical-600 py-2.5 text-xs font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Send the update
      </button>
      {sentAt && (
        <p className="mt-1.5 text-center text-[11px] text-slate-400">Last sent {formatDate(sentAt)}</p>
      )}
    </section>
  );
}

/** A member who develops something new stays one member. */
function ConditionsDialog({
  patientId, current, onClose, onSaved,
}: {
  patientId: string;
  current: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(current);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving || picked.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/doc-login/consults/patients/${patientId}/conditions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions: picked }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save that."); return; }
      toast.success("Conditions updated");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="What the plan covers"
      subtitle="Add anything that has developed since they joined."
      footer={
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || picked.length === 0}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-medical-600 py-2.5 text-xs font-bold text-white transition hover:bg-medical-700 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-1.5">
          {CONDITION_OPTIONS.map((c) => {
            const on = picked.includes(c);
            return (
              <button
                key={c}
                onClick={() => setPicked((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  on ? "bg-medical-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
            {CONDITION_LABEL[c] ?? c}
          </button>
        );
      })}
      </div>
    </Modal>
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

/**
 * @param caps title-case the value. Off by default: it was on for every row,
 *   which rendered `jackofot@gmail.com` as `Jackofot@Gmail.Com`. Only fields
 *   that are genuinely lower-case data — sex, a city — want it.
 */
function DetailRow({
  label, value, caps = false,
}: {
  label: string; value: string; caps?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-sm font-medium text-slate-700 ${caps ? "capitalize" : ""}`}>
        {value}
      </dd>
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
