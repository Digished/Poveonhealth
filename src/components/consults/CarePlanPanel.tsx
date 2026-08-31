"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { toast } from "react-hot-toast";
import {
  ArrowRight, CalendarClock, CalendarDays, Check, ClipboardList, Copy, FlaskConical, HeartPulse,
  ImagePlus, Loader2, MessageSquareText, Pill, RefreshCw, RotateCw, Send, Stethoscope, X,
} from "lucide-react";
import { SectionLoader } from "@/components/PageLoader";
import { getJson, invalidateJson } from "@/lib/client-cache";
import { CADENCE_LABEL } from "@/lib/treatment-plan";
import { CareHistoryPanel } from "@/components/consults/CareHistoryPanel";
import { Modal } from "@/components/ui/Overlay";
import { ProviderRow } from "@/components/consults/ProviderRow";
import type { Provider } from "@/components/consults/ProviderPicker";

// Only loaded once the member has a plan — an unenrolled dashboard has no
// check-in to prompt.
const ScreeningCard = dynamic(
  () => import("@/components/consults/ScreeningCard").then((m) => m.ScreeningCard),
  { ssr: false, loading: () => <div className="h-28 rounded-2xl border border-slate-100 bg-slate-50" /> }
);

const ProviderPicker = dynamic(
  () => import("@/components/consults/ProviderPicker").then((m) => m.ProviderPicker),
  { ssr: false }
);
import type { CarePlanBenefits, CarePlanPrefill } from "@/components/consults/CarePlanEnrollModal";
import { TopUpButton } from "@/components/consults/TopUpButton";
import { MedicationPay } from "@/components/consults/MedicationPay";

/**
 * The enrolment form and everything it needs — the state/LGA data, the fuzzy
 * combo, the phone and date inputs, the provider picker — is about a third of
 * this dashboard's JavaScript, and most visits never open it. Loaded on demand.
 */
const CarePlanEnrollModal = dynamic(
  () => import("@/components/consults/CarePlanEnrollModal").then((m) => m.CarePlanEnrollModal),
  { ssr: false }
);

type Member = {
  id: string; code: string | null; full_name: string; email: string; phone: string | null;
  sex: string | null; date_of_birth: string | null; conditions: string[]; status: string;
  share_history?: boolean;
  subscribed_at: string | null; expires_at: string | null;
  messages_used: number; message_allowance: number; messages_left: number;
};
type Doctor = { name: string; specialty: string | null; avatar_url: string | null };
type Message = {
  id: string; sender: string; body: string; created_at: string;
  /** Fetched through /api/consults/chat-image, which checks who is asking. */
  has_image?: boolean;
};
type Redemption = {
  id: string; kind: string; description: string | null; pharmacy_name: string | null;
  gross_naira: number; discount_naira: number; created_at: string;
};
type Prescription = {
  id: string; medication: string; form: string | null; dosage: string | null; frequency: string | null;
  instructions: string | null; start_date: string | null; end_date: string | null; status: string;
};
type TestOrder = {
  id: string; tests: string; reason: string | null; due_date: string | null;
  recurrence: string; status: string; created_at?: string | null;
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const CONDITION_LABEL: Record<string, string> = { hypertension: "Hypertension", diabetes: "Diabetes" };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * The care plan as it appears inside the patient's own dashboard: an invitation
 * when they haven't joined, and their card, benefits and doctor thread when
 * they have. Enrolment happens in a popup over this panel.
 */
export function CarePlanPanel({
  autoOpenEnroll = false,
  section = "plan",
  partnerCode = null,
  onChanged,
}: {
  autoOpenEnroll?: boolean;
  /** A partner whose QR code brought them here, pre-chosen on the form. */
  partnerCode?: { kind: "pharmacy" | "lab"; code: string } | null;
  /**
   * Which part of the plan to show. The card, benefits and providers are the
   * plan itself; the schedule and the thread each get their own sub-tab so
   * neither is buried under the other.
   */
  section?: "plan" | "schedule" | "messages" | "history";
  /** Lets the dashboard shell refresh its own care-plan prompt. */
  onChanged?: () => void;
}) {
  const [member, setMember] = useState<Member | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [testOrders, setTestOrders] = useState<TestOrder[]>([]);
  const [pharmacy, setPharmacy] = useState<Provider | null>(null);
  const [lab, setLab] = useState<Provider | null>(null);
  const [plan, setPlan] = useState<MemberPlan | null>(null);
  const [picking, setPicking] = useState<"pharmacy" | "lab" | null>(null);
  // Seeded rather than null, so a failed call still shows the invitation
  // instead of an empty tab.
  const [benefits, setBenefits] = useState<CarePlanBenefits>({
    price_naira: 10_000,
    message_allowance: 40,
    lab_discount_percent: 15,
    pharmacy_discount_percent: 10,
    topup_price_naira: 10_000,
    topup_messages: 40,
  });
  const [prefill, setPrefill] = useState<CarePlanPrefill>({});
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const opened = useRef(false);

  const load = useCallback(async (force = false) => {
    try {
      // Shared with the dashboard shell's prompt through the client cache.
      if (force) invalidateJson("/api/consults/me");
      const data = await getJson<Record<string, unknown> & { success?: boolean }>(
        "/api/consults/me", { force }
      ) as any;
      if (!data?.success) return;
      setMember(data.member);
      setDoctor(data.doctor ?? null);
      setMessages(data.messages ?? []);
      setRedemptions(data.redemptions ?? []);
      setPrescriptions(data.prescriptions ?? []);
      setTestOrders(data.test_orders ?? []);
      setPharmacy(data.preferred_pharmacy ?? null);
      setLab(data.preferred_lab ?? null);
      setPlan(data.plan ?? null);
      if (data.benefits) setBenefits(data.benefits);
      setPrefill(data.prefill ?? {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A ?care=1 deep link (from /consults) drops the visitor straight into the
  // form — but only once, so closing it doesn't immediately reopen it.
  useEffect(() => {
    if (!autoOpenEnroll || loading || opened.current) return;
    if (member?.status !== "active") {
      opened.current = true;
      setEnrolling(true);
    }
  }, [autoOpenEnroll, loading, member]);

  /** Persist a provider choice; the row updates as soon as it saves. */
  const savePreference = useCallback(async (kind: "pharmacy" | "lab", provider: Provider | null) => {
    if (kind === "pharmacy") setPharmacy(provider);
    else setLab(provider);
    try {
      await fetch("/api/consults/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "pharmacy"
            ? { preferred_pharmacy_id: provider?.id ?? null }
            : { preferred_lab_id: provider?.id ?? null }
        ),
      });
      invalidateJson("/api/consults/me");
    } catch {
      /* the next load reconciles it */
    }
  }, []);

  /** Whether a new doctor inherits the thread and the notes. */
  const saveHistorySharing = useCallback(async (share: boolean) => {
    setMember((prev) => (prev ? { ...prev, share_history: share } : prev));
    try {
      const res = await fetch("/api/consults/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ share_history: share }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) {
        toast.error(d?.error ?? "Could not save that.");
        setMember((prev) => (prev ? { ...prev, share_history: !share } : prev));
        return;
      }
      invalidateJson("/api/consults/me");
    } catch {
      setMember((prev) => (prev ? { ...prev, share_history: !share } : prev));
    }
  }, []);

  function copyCode() {
    if (!member?.code) return;
    navigator.clipboard.writeText(member.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  if (loading) return <SectionLoader label="Loading your care plan…" />;

  const active = member?.status === "active";
  // An unpaid, abandoned sign-up has never had a plan — inviting them to
  // "renew" would be wrong.
  const lapsed = member?.status === "expired" || member?.status === "cancelled";

  return (
    <div className="space-y-4">
      {!active && <JoinInvite benefits={benefits} lapsed={lapsed} onJoin={() => setEnrolling(true)} />}

      {active && member && section === "schedule" && (
        <>
          {/* The one place a member's medication is listed. It carries the
              doctor's directions and the price together, so there is nothing
              left for a second list to add. */}
          <MedicationPay onPickPharmacy={() => setPicking("pharmacy")} />
          <TestSchedule testOrders={testOrders} />
        </>
      )}

      {active && member && section === "history" && (
        <CareHistoryPanel
          shareHistory={member.share_history !== false}
          onShareChange={saveHistorySharing}
          events={[
            ...testOrders.map((t) => ({
              when: t.status === "done" ? t.due_date ?? t.created_at ?? "" : t.due_date ?? "",
              title: t.tests,
              detail:
                t.status === "done" ? "Test done" : t.status === "cancelled" ? "Cancelled" : "Booked by your doctor",
              kind: "test" as const,
            })),
            ...prescriptions.map((m) => ({
              when: m.start_date ?? "",
              title: m.medication,
              detail:
                m.status === "cancelled" ? "Stopped"
                : m.status === "completed" ? "Course finished"
                : "Added by your doctor",
              kind: "medication" as const,
            })),
            ...redemptions.map((r) => ({
              when: r.created_at,
              title: r.description ?? (r.kind === "pharmacy" ? "Pharmacy visit" : "Lab visit"),
              detail: `You saved ${naira(r.discount_naira)}${r.pharmacy_name ? ` at ${r.pharmacy_name}` : ""}`,
              kind: "saving" as const,
            })),
            ...(plan ? [{
              when: plan.updated_at,
              title: plan.title,
              detail: `Your doctor set out ${plan.items.length} thing${plan.items.length === 1 ? "" : "s"} to do`,
              kind: "plan" as const,
            }] : []),
          ]
            .filter((e) => e.when)
            .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
            .slice(0, 60)}
        />
      )}

      {active && member && section === "messages" && (
        <MessageThread
          doctor={doctor}
          member={member}
          messages={messages}
          benefits={benefits}
          onSent={(m, left) => {
            setMessages((prev) => [...prev, m]);
            setMember((prev) =>
              prev ? { ...prev, messages_left: left, messages_used: prev.messages_used + 1 } : prev
            );
          }}
        />
      )}

      {active && member && section === "plan" && (
        <div className="space-y-4">
          <PlanHero
            member={member}
            doctor={doctor}
            plan={plan}
            savedNaira={redemptions.reduce((sum, r) => sum + r.discount_naira, 0)}
            copied={copied}
            onCopy={copyCode}
          />

          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
            <div className="space-y-4">
              <ScreeningCard />
              <CarePlanChecklist plan={plan} onTicked={setPlan} />
            </div>

            <div className="space-y-4">
              {/* Where they'd rather be sent — switchable whenever they like. */}
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Where you like to go
                </h3>
                <div className="mt-3 space-y-2">
                  <ProviderRow
                    kind="pharmacy"
                    provider={pharmacy}
                    onOpen={() => setPicking("pharmacy")}
                    onClear={() => savePreference("pharmacy", null)}
                  />
                  <ProviderRow
                    kind="lab"
                    provider={lab}
                    onOpen={() => setPicking("lab")}
                    onClear={() => savePreference("lab", null)}
                  />
                </div>
                <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
                  Your pharmacy sets the prices you see under Medication. Change these any time —
                  your care code works at every partner either way.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  What your plan gets you
                </h3>
                <div className="mt-3 space-y-2.5">
                  <BenefitRow
                    icon={<FlaskConical className="h-4 w-4" />}
                    label={`Up to ${benefits.lab_discount_percent}% off lab tests`}
                    hint="Show your code at any partner lab"
                  />
                  <BenefitRow
                    icon={<Pill className="h-4 w-4" />}
                    label={`Up to ${benefits.pharmacy_discount_percent}% off medication`}
                    hint="Priced and paid for in the app"
                  />
                  <BenefitRow
                    icon={<MessageSquareText className="h-4 w-4" />}
                    label={`${member.messages_left} of ${member.message_allowance} messages left`}
                    hint="Your doctor's replies are unlimited"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {picking && (
        <ProviderPicker
          kind={picking}
          value={(picking === "pharmacy" ? pharmacy : lab)?.id ?? null}
          onChange={(p) => savePreference(picking, p)}
          onClose={() => setPicking(null)}
        />
      )}

      {enrolling && (
        <CarePlanEnrollModal
          benefits={benefits}
          partnerCode={partnerCode}
          onClose={() => { setEnrolling(false); onChanged?.(); }}
          prefill={
            member
              ? {
                  full_name: member.full_name,
                  phone: member.phone ?? "",
                  sex: member.sex ?? "",
                  date_of_birth: member.date_of_birth ? member.date_of_birth.slice(0, 10) : "",
                }
              : prefill
          }
        />
      )}
    </div>
  );
}

function JoinInvite({
  benefits, lapsed, onJoin,
}: {
  benefits: CarePlanBenefits; lapsed: boolean; onJoin: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-medical-100 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-medical-600 to-medical-800 px-6 py-7 text-white">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
          <HeartPulse className="h-5 w-5" />
        </div>
        <h2 className="mt-3 text-xl font-bold">
          {lapsed ? "Your care plan has ended" : "A year of care for hypertension or diabetes"}
        </h2>
        <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-white/80">
          {lapsed
            ? "Renew to get your care code working again and pick up with a doctor."
            : "One yearly payment: cheaper tests, cheaper prescriptions, and a doctor who knows your name."}
        </p>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Benefit
            icon={<FlaskConical className="h-5 w-5" />}
            value={`Up to ${benefits.lab_discount_percent}%`}
            label="Lab tests at partner labs"
          />
          <Benefit
            icon={<Pill className="h-5 w-5" />}
            value={`Up to ${benefits.pharmacy_discount_percent}%`}
            label="Prescriptions at partner pharmacies"
          />
          <Benefit
            icon={<MessageSquareText className="h-5 w-5" />}
            value={`${benefits.message_allowance} messages`}
            label="To your own doctor, all year"
          />
        </div>

        <button
          onClick={onJoin}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medical-600 py-4 text-sm font-bold text-white shadow-lg shadow-medical-600/25 transition hover:bg-medical-700"
        >
          {lapsed ? <RefreshCw className="h-4 w-4" /> : <HeartPulse className="h-4 w-4" />}
          {lapsed ? "Renew my care plan" : `Join for ${naira(benefits.price_naira)} a year`}
          <ArrowRight className="h-4 w-4" />
        </button>
        <p className="text-center text-xs text-slate-400">
          Takes about a minute — we&apos;ve already filled in most of it for you.
        </p>
      </div>
    </div>
  );
}

function Benefit({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-medical-50 text-medical-600">{icon}</div>
      <p className="mt-2.5 text-base font-extrabold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{label}</p>
    </div>
  );
}

/**
 * The plan, not the code.
 *
 * The card used to lead with PVC-8X4K29 set in the largest type on the page,
 * which told a member the one thing they already knew and nothing about their
 * care. What leads now is what the plan is *for* and where it has got to: the
 * conditions it covers, the doctor holding it, what is outstanding today and
 * what it has saved them. The code is still here — it is what a partner
 * pharmacy or lab asks for — as a strip along the bottom, findable in a second
 * and no longer the point.
 */
function PlanHero({
  member, doctor, plan, savedNaira, copied, onCopy,
}: {
  member: Member;
  doctor: Doctor | null;
  plan: MemberPlan | null;
  savedNaira: number;
  copied: boolean;
  onCopy: () => void;
}) {
  const conditions = member.conditions.map((c) => CONDITION_LABEL[c] ?? c);
  const due = plan?.items.filter((i) => i.due).length ?? 0;

  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-medical-600 via-medical-700 to-medical-800 text-white shadow-lg shadow-medical-600/20">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
              Poveon Care Plan
            </p>
            <h2 className="mt-1 text-xl font-black leading-tight sm:text-2xl">
              {conditions.length ? `${conditions.join(" & ")} care` : "Your care plan"}
            </h2>
            <p className="mt-1 text-sm text-white/75">
              {doctor?.name ? `With ${doctor.name}` : "Matching you with a doctor…"}
              <span className="text-white/50"> · to {formatDate(member.expires_at)}</span>
            </p>
          </div>
          <HeartPulse className="h-7 w-7 shrink-0 animate-pulse opacity-50" />
        </div>

        {/* Where the plan has got to, in the three numbers a member acts on. */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <PlanStat
            value={due === 0 ? "None" : String(due)}
            label={due === 0 ? "Nothing due today" : due === 1 ? "Thing to do today" : "Things to do today"}
          />
          <PlanStat value={naira(savedNaira)} label="Saved so far" />
          <PlanStat value={String(member.messages_left)} label="Messages left" />
        </div>
      </div>

      {/* The code, kept where a pharmacy counter can find it. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 bg-black/10 px-5 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
            Your care code
          </p>
          <p className="font-mono text-sm font-bold tracking-[0.18em]">{member.code}</p>
        </div>
        <button
          onClick={onCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/25 active:scale-95"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
}

function PlanStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-inset ring-white/10">
      <p className="truncate text-lg font-black leading-none sm:text-xl">{value}</p>
      <p className="mt-1 text-[10px] leading-tight text-white/65 sm:text-[11px]">{label}</p>
    </div>
  );
}

const RECURRENCE_LABEL: Record<string, string> = {
  once: "One-off",
  monthly: "Every month",
  quarterly: "Every 3 months",
  biannual: "Every 6 months",
  annual: "Every year",
};

/** Days until a date; negative means it has passed. */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/**
 * The tests the member's doctor has booked.
 *
 * Medication is deliberately not here. It lives in one place — the priced list
 * a member can pay from — because the same drug written out twice, once with a
 * price and once without, is worse than either on its own.
 */
function TestSchedule({ testOrders }: { testOrders: TestOrder[] }) {
  const due = testOrders.filter((t) => t.status === "scheduled");
  if (due.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center">
        <FlaskConical className="mx-auto mb-2 h-7 w-7 text-slate-200" />
        <p className="text-sm font-semibold text-slate-600">No tests booked</p>
        <p className="mt-1 text-xs text-slate-400">
          When your doctor books one, it appears here — take your care code to any partner lab for
          money off.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
        <FlaskConical className="h-3.5 w-3.5" />
        Tests your doctor wants
      </h3>
      <ul className="mt-3 space-y-2">
        {due.map((t) => {
          const days = daysUntil(t.due_date);
          const overdue = days != null && days < 0;
          return (
            <li
              key={t.id}
              className={`rounded-xl border px-3 py-2.5 ${
                overdue ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50/70"
              }`}
            >
              <p className="text-sm font-semibold text-slate-800">{t.tests}</p>
              {t.reason && <p className="mt-0.5 text-xs text-slate-500">{t.reason}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px]">
                <span className={overdue ? "font-bold text-amber-700" : "text-slate-500"}>
                  <CalendarClock className="mr-1 inline h-3 w-3" />
                  {t.due_date
                    ? overdue
                      ? "Overdue"
                      : days === 0
                      ? "Due today"
                      : `Due ${formatDate(t.due_date)}`
                    : "No date set"}
                </span>
                {t.recurrence !== "once" && (
                  <span className="inline-flex items-center gap-0.5 text-slate-400">
                    <RotateCw className="h-3 w-3" />
                    {RECURRENCE_LABEL[t.recurrence] ?? t.recurrence}
                  </span>
                )}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[11px] text-slate-400">
        Your care code takes money off these at any partner lab.
      </p>
    </div>
  );
}

function BenefitRow({ icon, label, hint }: { icon: React.ReactNode; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-medical-50 text-medical-600">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
    </div>
  );
}

function MessageThread({
  doctor, member, messages, benefits, onSent,
}: {
  doctor: Doctor | null;
  member: Member;
  messages: Message[];
  benefits: CarePlanBenefits;
  onSent: (m: Message, messagesLeft: number) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const outOfMessages = member.messages_left <= 0;

  async function send() {
    const text = body.trim();
    // A photo on its own is a message — "here is my reading" needs no words.
    if (sending || (!text && !file)) return;
    setSending(true);
    setError("");
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("body", text);
        form.append("file", file);
        res = await fetch("/api/consults/messages", { method: "POST", body: form });
      } else {
        res = await fetch("/api/consults/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error ?? "Could not send that message.");
        return;
      }
      onSent(data.message, data.messages_left);
      setBody("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        {doctor?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doctor.avatar_url} alt={doctor.name} className="h-10 w-10 rounded-xl object-cover ring-1 ring-slate-100" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-medical-50 text-medical-500">
            <Stethoscope className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{doctor?.name || "Matching you with a doctor…"}</p>
          <p className="truncate text-xs text-slate-400">
            {doctor ? doctor.specialty || "Your care-plan doctor" : "This usually takes a few minutes"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
          {member.messages_left} left
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <MessageSquareText className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">No messages yet</p>
            <p className="max-w-xs text-xs text-slate-400">
              Your doctor will send a first assessment. You can write to them any time.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === "patient" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                  m.sender === "patient"
                    ? "rounded-br-md bg-medical-600 text-white"
                    : "rounded-bl-md border border-slate-100 bg-white text-slate-700"
                }`}
              >
                {m.has_image && (
                  <a
                    href={`/api/consults/chat-image?id=${m.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-1.5 block overflow-hidden rounded-xl"
                  >
                    {/* Served from a private bucket through a signed link, so
                        it is loaded unoptimised rather than via the image CDN. */}
                    <Image
                      src={`/api/consults/chat-image?id=${m.id}`}
                      alt="Attached photo"
                      width={320}
                      height={240}
                      unoptimized
                      className="h-auto w-full max-w-[280px] object-cover"
                    />
                  </a>
                )}
                {m.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>}
                <p className={`mt-1 text-[10px] ${m.sender === "patient" ? "text-white/60" : "text-slate-400"}`}>
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
        {outOfMessages ? (
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-center text-xs text-slate-500">
              You&apos;ve used all {member.message_allowance} messages for this year. Your plan renews
              on {formatDate(member.expires_at)} — or top up now and carry on.
            </p>
            <TopUpButton
              className="mt-3"
              messages={benefits.topup_messages ?? 40}
              priceNaira={benefits.topup_price_naira ?? 10_000}
            />
          </div>
        ) : (
          <>
            {file && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="truncate text-xs text-slate-600">{file.name}</span>
                <button
                  onClick={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  className="text-slate-400 transition hover:text-slate-600"
                  aria-label="Remove photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-medical-600"
                aria-label="Attach a photo"
                title="Attach a photo of a reading, a rash, a strip of tablets…"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <textarea
                rows={2}
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe what's changed — symptoms, readings, questions about your medication…"
                className="flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40"
              />
              <button
                onClick={send}
                disabled={sending || (!body.trim() && !file)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-medical-600 text-white transition hover:bg-medical-700 disabled:opacity-40"
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Uses 1 of your {member.messages_left} remaining messages. You can attach a photo. Not
              for emergencies.
            </p>
          </>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}


// ── The plan the member works from ──────────────────────────────────────────

export type MemberPlanItem = {
  id: string;
  label: string;
  detail: string | null;
  cadence: string;
  measure?: string;
  measure_label?: string | null;
  done_count: number;
  due: boolean;
  days_until: number | null;
  last_done_at: string | null;
};

export type MemberPlan = {
  id: string;
  title: string;
  note: string | null;
  updated_at: string;
  items: MemberPlanItem[];
};

/**
 * The doctor's checklist, with what is outstanding right now.
 *
 * Ticking records when, not that: the next time an item comes due is worked
 * out from its cadence, so missing a week leaves one thing to do rather than
 * seven.
 */
function CarePlanChecklist({
  plan,
  onTicked,
}: {
  plan: MemberPlan | null;
  onTicked: (plan: MemberPlan) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [logging, setLogging] = useState<MemberPlanItem | null>(null);

  if (!plan || plan.items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <ClipboardList className="h-3.5 w-3.5" /> Your plan
        </h3>
        <p className="py-4 text-center text-xs text-slate-400">
          Your doctor hasn&apos;t written one yet. Ask them what you should be doing between
          check-ins.
        </p>
      </div>
    );
  }

  const due = plan.items.filter((i) => i.due);

  async function tick(item: MemberPlanItem, reading?: Record<string, unknown>) {
    setBusy(item.id);
    try {
      const res = await fetch("/api/consults/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id, done: item.due, ...(reading ?? {}) }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) { toast.error(d?.error ?? "Could not save that."); return; }
      onTicked({
        ...plan!,
        items: plan!.items.map((i) => (i.id === item.id ? { ...i, ...d.item } : i)),
      });
      // Their doctor sees a reading that needs attention straight away, so say
      // so here rather than letting it pass silently.
      if (d.risk?.level === "critical" || d.risk?.level === "high") {
        toast(
          d.risk.level === "critical"
            ? "That reading is high — your doctor has been alerted. If you feel unwell, seek care now."
            : "That reading is on the high side. Your doctor can see it.",
          { icon: "⚠️", duration: 7000 }
        );
      } else {
        toast.success("Logged");
      }
    } finally {
      setBusy(null);
    }
  }

  /** An item that asks for a number opens the log sheet instead of just ticking. */
  function start(item: MemberPlanItem) {
    if (item.due && item.measure && item.measure !== "none") setLogging(item);
    else void tick(item);
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <ClipboardList className="h-3.5 w-3.5" /> {plan.title}
        </h3>
        <span className="text-[11px] font-semibold text-slate-400">
          {due.length ? `${due.length} to do` : "All caught up"}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {plan.items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 transition ${
              item.due ? "border-medical-200 bg-medical-50/40" : "border-slate-200 bg-white"
            }`}
          >
            <button
              onClick={() => start(item)}
              disabled={busy === item.id}
              aria-label={item.due ? `Mark "${item.label}" done` : `Undo "${item.label}"`}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-40 ${
                item.due
                  ? "border-medical-400 hover:bg-medical-100"
                  : "border-emerald-500 bg-emerald-500 text-white"
              }`}
            >
              {busy === item.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : !item.due ? (
                <Check className="h-3 w-3" />
              ) : null}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${item.due ? "text-slate-800" : "text-slate-400 line-through"}`}>
                {item.label}
              </p>
              {item.detail && <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>}
              <p className="mt-0.5 text-[11px] text-slate-400">
                {CADENCE_LABEL[item.cadence] ?? item.cadence}
                {item.measure && item.measure !== "none" ? " · records a reading" : ""}
                {!item.due && item.days_until != null
                  ? ` · again in ${item.days_until} day${item.days_until === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {plan.note && (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{plan.note}</p>
      )}

      {logging && (
        <LogSheet
          item={logging}
          saving={busy === logging.id}
          onClose={() => setLogging(null)}
          onSave={async (reading) => {
            await tick(logging, reading);
            setLogging(null);
          }}
        />
      )}
    </div>
  );
}

const logInput =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

/**
 * What they measured, when they tick something that asks for it.
 *
 * Deliberately one screen with the keyboard in mind: the number first, a note
 * second, and nothing else to read.
 */
function LogSheet({
  item, saving, onClose, onSave,
}: {
  item: MemberPlanItem;
  saving: boolean;
  onClose: () => void;
  onSave: (reading: Record<string, unknown>) => void;
}) {
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [glucose, setGlucose] = useState("");
  const [weight, setWeight] = useState("");
  const [value, setValue] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");

  const ready =
    item.measure === "bp" ? !!systolic && !!diastolic
    : item.measure === "glucose" ? !!glucose
    : item.measure === "weight" ? !!weight
    : item.measure === "number" ? !!value
    : item.measure === "text" ? text.trim().length > 0
    : true;

  const reading = () => ({
    systolic: systolic ? Number(systolic) : null,
    diastolic: diastolic ? Number(diastolic) : null,
    glucose_mg_dl: glucose ? Number(glucose) : null,
    weight_kg: weight ? Number(weight) : null,
    value_number: value ? Number(value) : null,
    value_text: text.trim() || null,
    note: note.trim() || null,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={item.label}
      subtitle={item.detail ?? "Record what you got"}
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => onSave(reading())}
            disabled={saving || !ready}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-medical-600 py-2.5 text-sm font-bold text-white transition hover:bg-medical-700 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save it
          </button>
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {item.measure === "bp" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Your reading</label>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                inputMode="numeric"
                maxLength={3}
                value={systolic}
                onChange={(e) => setSystolic(e.target.value.replace(/\D/g, ""))}
                placeholder="120"
                className={`${logInput} text-center text-lg font-bold`}
              />
              <span className="text-lg font-bold text-slate-300">/</span>
              <input
                inputMode="numeric"
                maxLength={3}
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value.replace(/\D/g, ""))}
                placeholder="80"
                className={`${logInput} text-center text-lg font-bold`}
              />
              <span className="shrink-0 text-xs text-slate-400">mmHg</span>
            </div>
          </div>
        )}

        {item.measure === "glucose" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Your reading</label>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                inputMode="decimal"
                value={glucose}
                onChange={(e) => setGlucose(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="95"
                className={`${logInput} text-center text-lg font-bold`}
              />
              <span className="shrink-0 text-xs text-slate-400">mg/dL</span>
            </div>
          </div>
        )}

        {item.measure === "weight" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Your weight</label>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="72"
                className={`${logInput} text-center text-lg font-bold`}
              />
              <span className="shrink-0 text-xs text-slate-400">kg</span>
            </div>
          </div>
        )}

        {item.measure === "number" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              {item.measure_label || "The number"}
            </label>
            <input
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
              className={`${logInput} text-center text-lg font-bold`}
            />
          </div>
        )}

        {item.measure === "text" && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">How did it go?</label>
            <textarea
              autoFocus
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={`${logInput} resize-none`}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">
            Anything to add? <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How you felt, anything unusual…"
            className={`${logInput} resize-none`}
          />
        </div>

        <p className="text-[11px] text-slate-400">
          Your doctor sees this as part of your daily log.
        </p>
      </div>
    </Modal>
  );
}
