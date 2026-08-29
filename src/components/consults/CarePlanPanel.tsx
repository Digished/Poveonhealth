"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, Copy, FlaskConical, HeartPulse, Loader2, MessageSquareText, Pill,
  Send, Stethoscope, CalendarDays, ArrowRight, RefreshCw, CalendarClock, RotateCw,
} from "lucide-react";
import { SectionLoader } from "@/components/PageLoader";
import { getJson, invalidateJson } from "@/lib/client-cache";
import {
  CarePlanEnrollModal,
  type CarePlanBenefits,
  type CarePlanPrefill,
} from "@/components/consults/CarePlanEnrollModal";

type Member = {
  id: string; code: string | null; full_name: string; email: string; phone: string | null;
  sex: string | null; date_of_birth: string | null; conditions: string[]; status: string;
  subscribed_at: string | null; expires_at: string | null;
  messages_used: number; message_allowance: number; messages_left: number;
};
type Doctor = { name: string; specialty: string | null; avatar_url: string | null };
type Message = { id: string; sender: string; body: string; created_at: string };
type Redemption = {
  id: string; kind: string; description: string | null; pharmacy_name: string | null;
  gross_naira: number; discount_naira: number; created_at: string;
};
type Prescription = {
  id: string; medication: string; dosage: string | null; frequency: string | null;
  instructions: string | null; start_date: string | null; end_date: string | null; status: string;
};
type TestOrder = {
  id: string; tests: string; reason: string | null; due_date: string | null;
  recurrence: string; status: string;
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
  onChanged,
}: {
  autoOpenEnroll?: boolean;
  /** Lets the dashboard shell refresh its own care-plan prompt. */
  onChanged?: () => void;
}) {
  const [member, setMember] = useState<Member | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [testOrders, setTestOrders] = useState<TestOrder[]>([]);
  // Seeded rather than null, so a failed call still shows the invitation
  // instead of an empty tab.
  const [benefits, setBenefits] = useState<CarePlanBenefits>({
    price_naira: 10_000,
    message_allowance: 40,
    lab_discount_percent: 15,
    pharmacy_discount_percent: 10,
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

  function copyCode() {
    if (!member?.code) return;
    navigator.clipboard.writeText(member.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  if (loading) return <SectionLoader label="Loading your care plan…" />;

  const active = member?.status === "active";
  const lapsed = !!member && !active;

  return (
    <div className="space-y-4">
      {!active && <JoinInvite benefits={benefits} lapsed={lapsed} onJoin={() => setEnrolling(true)} />}

      {active && member && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="space-y-4">
            {/* Care card */}
            <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-medical-600 to-medical-800 p-5 text-white shadow-lg shadow-medical-600/20">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Poveon Care Plan</p>
                  <p className="mt-0.5 text-lg font-bold">{member.full_name}</p>
                </div>
                <HeartPulse className="h-6 w-6 opacity-60" />
              </div>
              <p className="mt-5 font-mono text-2xl font-extrabold tracking-widest">{member.code}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-white/70">Valid to {formatDate(member.expires_at)}</span>
                <button
                  onClick={copyCode}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-2.5 py-1.5 text-xs font-semibold transition hover:bg-white/30"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {member.conditions.map((c) => (
                  <span key={c} className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">
                    {CONDITION_LABEL[c] ?? c}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">What your code gets you</h3>
              <div className="mt-3 space-y-2.5">
                <BenefitRow
                  icon={<FlaskConical className="h-4 w-4" />}
                  label={`${benefits.lab_discount_percent}% off lab tests`}
                  hint="Show your code at any partner lab"
                />
                <BenefitRow
                  icon={<Pill className="h-4 w-4" />}
                  label={`${benefits.pharmacy_discount_percent}% off medication`}
                  hint="BP and diabetes prescriptions at partner pharmacies"
                />
                <BenefitRow
                  icon={<MessageSquareText className="h-4 w-4" />}
                  label={`${member.messages_left} of ${member.message_allowance} messages left`}
                  hint="Your doctor's replies are unlimited"
                />
              </div>
            </div>

            <CareSchedule prescriptions={prescriptions} testOrders={testOrders} />

            {redemptions.length > 0 && (
              <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Savings so far</h3>
                <p className="mt-2 text-2xl font-extrabold text-emerald-600">
                  {naira(redemptions.reduce((sum, r) => sum + r.discount_naira, 0))}
                </p>
                <ul className="mt-3 space-y-2">
                  {redemptions.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="min-w-0 flex-1 text-slate-600">
                        {r.description || (r.kind === "pharmacy" ? "Prescription" : "Lab test")}
                        {r.pharmacy_name && <span className="text-slate-400"> · {r.pharmacy_name}</span>}
                      </span>
                      <span className="shrink-0 font-semibold text-emerald-600">−{naira(r.discount_naira)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <MessageThread
            doctor={doctor}
            member={member}
            messages={messages}
            onSent={(m, left) => {
              setMessages((prev) => [...prev, m]);
              setMember((prev) =>
                prev ? { ...prev, messages_left: left, messages_used: prev.messages_used + 1 } : prev
              );
            }}
          />
        </div>
      )}

      {enrolling && (
        <CarePlanEnrollModal
          benefits={benefits}
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
            value={`${benefits.lab_discount_percent}% off`}
            label="Lab tests at partner labs"
          />
          <Benefit
            icon={<Pill className="h-5 w-5" />}
            value={`${benefits.pharmacy_discount_percent}% off`}
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

/** What the member's doctor has put them on, and what they owe the lab. */
function CareSchedule({
  prescriptions, testOrders,
}: {
  prescriptions: Prescription[]; testOrders: TestOrder[];
}) {
  const meds = prescriptions.filter((p) => p.status === "active");
  const due = testOrders.filter((t) => t.status === "scheduled");
  if (meds.length === 0 && due.length === 0) return null;

  return (
    <div className="space-y-4">
      {due.length > 0 && (
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
      )}

      {meds.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Pill className="h-3.5 w-3.5" />
            Your medication
          </h3>
          <ul className="mt-3 space-y-2">
            {meds.map((m) => (
              <li key={m.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-800">{m.medication}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[m.dosage, m.frequency].filter(Boolean).join(" · ") || "As directed"}
                </p>
                {m.instructions && <p className="mt-1 text-xs text-slate-500">{m.instructions}</p>}
                <p className="mt-1 text-[11px] text-slate-400">
                  {m.end_date ? `Until ${formatDate(m.end_date)}` : "Ongoing"}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] text-slate-400">
            Show your care code at a partner pharmacy for money off these.
          </p>
        </div>
      )}
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
  doctor, member, messages, onSent,
}: {
  doctor: Doctor | null;
  member: Member;
  messages: Message[];
  onSent: (m: Message, messagesLeft: number) => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const outOfMessages = member.messages_left <= 0;

  async function send() {
    if (sending || body.trim().length < 2) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/consults/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "Could not send that message.");
        return;
      }
      onSent(data.message, data.messages_left);
      setBody("");
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
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
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
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
            You&apos;ve used all {member.message_allowance} messages for this year. Your plan renews on{" "}
            {formatDate(member.expires_at)}.
          </p>
        ) : (
          <>
            <div className="flex items-end gap-2">
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
                disabled={sending || body.trim().length < 2}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-medical-600 text-white transition hover:bg-medical-700 disabled:opacity-40"
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Uses 1 of your {member.messages_left} remaining messages. Not for emergencies.
            </p>
          </>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
