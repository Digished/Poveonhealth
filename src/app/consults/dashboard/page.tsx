"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check, Copy, FlaskConical, Loader2, LogOut, MessageSquareText, Pill,
  Send, Target, Pencil, Stethoscope, CalendarDays,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { SectionLoader } from "@/components/PageLoader";

type Member = {
  id: string; code: string; full_name: string; email: string; phone: string | null;
  conditions: string[]; goal: string | null; goal_metric: string | null;
  status: string; subscribed_at: string | null; expires_at: string | null;
  messages_used: number; message_allowance: number; messages_left: number;
};
type Doctor = { name: string; specialty: string | null; avatar_url: string | null };
type Message = { id: string; sender: string; body: string; created_at: string };
type Redemption = {
  id: string; kind: string; description: string | null; pharmacy_name: string | null;
  gross_naira: number; discount_naira: number; created_at: string;
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
const CONDITION_LABEL: Record<string, string> = { hypertension: "Hypertension", diabetes: "Diabetes" };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function CarePlanDashboard() {
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [benefits, setBenefits] = useState({ lab_discount_percent: 0, pharmacy_discount_percent: 0 });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/consults/me", { cache: "no-store" });
      if (res.status === 401) { router.replace("/consults/login"); return; }
      const data = await res.json();
      if (!data.success) return;
      setMember(data.member);
      setDoctor(data.doctor);
      setMessages(data.messages);
      setRedemptions(data.redemptions);
      setBenefits(data.benefits);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function signOut() {
    await fetch("/api/consults/logout", { method: "POST" });
    router.replace("/consults/login");
  }

  function copyCode() {
    if (!member) return;
    navigator.clipboard.writeText(member.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-white to-emerald-50/60">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/consults" className="flex items-center gap-2">
            <PoveonLogo className="h-6 w-6 text-medical-600" />
            <span className="font-bold text-slate-900">Care Plan</span>
          </Link>
          <span className="ml-auto truncate text-xs text-slate-400">{member?.email}</span>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        {loading && <SectionLoader label="Loading your care plan…" />}

        {!loading && member && (
          <>
            {member.status !== "active" && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Your care plan isn&apos;t active yet.{" "}
                <Link href="/consults#join" className="font-bold underline">Complete your payment</Link> to start using it.
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
              {/* Left column: card, goal, benefits */}
              <div className="space-y-5">
                {/* Care card */}
                <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-medical-600 to-medical-800 p-5 text-white shadow-lg shadow-medical-600/20">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Poveon Care Plan</p>
                      <p className="mt-0.5 text-lg font-bold">{member.full_name}</p>
                    </div>
                    <PoveonLogo className="h-6 w-6 opacity-60" />
                  </div>
                  <p className="mt-5 font-mono text-2xl font-extrabold tracking-widest">{member.code}</p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-white/70">
                      Valid to {formatDate(member.expires_at)}
                    </span>
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

                {/* Benefits */}
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">What your code gets you</h2>
                  <div className="mt-3 space-y-2.5">
                    <BenefitRow
                      icon={<FlaskConical className="h-4 w-4" />}
                      label={`${benefits.lab_discount_percent}% off lab tests`}
                      hint="Show your code at any partner lab"
                    />
                    <BenefitRow
                      icon={<Pill className="h-4 w-4" />}
                      label={`${benefits.pharmacy_discount_percent}% off prescriptions`}
                      hint="Show your code at any partner pharmacy"
                    />
                    <BenefitRow
                      icon={<MessageSquareText className="h-4 w-4" />}
                      label={`${member.messages_left} of ${member.message_allowance} messages left`}
                      hint="Your doctor's replies are unlimited"
                    />
                  </div>
                </div>

                <GoalCard member={member} onSaved={(g, m) => setMember({ ...member, goal: g, goal_metric: m })} />

                {redemptions.length > 0 && (
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Savings so far</h2>
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

              {/* Right column: the thread */}
              <MessageThread
                doctor={doctor}
                member={member}
                messages={messages}
                onSent={(m, left) => {
                  setMessages((prev) => [...prev, m]);
                  setMember((prev) => (prev ? { ...prev, messages_left: left, messages_used: prev.messages_used + 1 } : prev));
                }}
              />
            </div>
          </>
        )}
      </main>
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

function GoalCard({ member, onSaved }: { member: Member; onSaved: (goal: string, metric: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState(member.goal ?? "");
  const [metric, setMetric] = useState(member.goal_metric ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving || goal.trim().length < 3) return;
    setSaving(true);
    try {
      const res = await fetch("/api/consults/goal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goal.trim(), goal_metric: metric.trim() || null }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved(data.goal, data.goal_metric);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
          <Target className="h-3.5 w-3.5" />
          My goal this year
        </h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 transition hover:text-emerald-900"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            rows={3}
            maxLength={500}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="w-full resize-none rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          />
          <input
            value={metric}
            maxLength={300}
            onChange={(e) => setMetric(e.target.value)}
            placeholder="How will you know you got there?"
            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || goal.trim().length < 3}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Save
            </button>
            <button
              onClick={() => { setEditing(false); setGoal(member.goal ?? ""); setMetric(member.goal_metric ?? ""); }}
              className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium leading-relaxed text-emerald-900">
            {member.goal || "You haven't set a goal yet."}
          </p>
          {member.goal_metric && (
            <p className="mt-1.5 text-xs text-emerald-700/80">Measured by: {member.goal_metric}</p>
          )}
        </>
      )}
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
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* Doctor header */}
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

      {/* Thread */}
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <MessageSquareText className="h-10 w-10 text-slate-200" />
            <p className="text-sm font-semibold text-slate-500">No messages yet</p>
            <p className="max-w-xs text-xs text-slate-400">
              Your doctor will send a first assessment based on your goal. You can write to them any time.
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

      {/* Composer */}
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
