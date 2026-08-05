"use client";

import { Children, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Check, Search, RefreshCw, Pencil, Phone, Undo2, QrCode, MessageCircle, CreditCard, Stethoscope, Hourglass, UserCheck, UserPlus, X, Printer, AlertTriangle, Workflow, Mail, MapPin, ChevronRight, Copy, MoreHorizontal, ClipboardCheck, Eye, FileText, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { FullViewModal } from "@/components/ui/FullViewModal";
import { LabOnboardForm, OnboardTemplate } from "@/components/lab/LabOnboardForm";
import { TestTagInput, TestTag } from "@/components/ui/TestTagInput";
import { SourceBadge } from "@/components/lab/SourceBadge";

const JourneyView = dynamic(() => import("@/components/lab/JourneyView").then((m) => ({ default: m.JourneyView })), { ssr: false });

interface QueueReq {
  id: string;
  code: string;
  status: string;
  source: string;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  patient_age: number | null;
  dob: string | null;
  sex: string | null;
  address: string | null;
  doctor_name: string | null;
  doctor_hospital: string | null;
  tests: string;
  test_image_url: string | null;
  diagnosis: string | null;
  referral_type: string | null;
  policy_number: string | null;
  whatsapp_phone: string | null;
  payment_mode: string | null;
  is_paid: boolean;
  quoted_price: number | null;
  test_breakdown: unknown;
  created_at: string;
  arrived_at: string | null;
  queue_confirmed_at: string | null;
  attended_at: string | null;
  queue_number: number | null;
  attending_by: string | null;
  attending_since: string | null;
  details_captured_at: string | null;
  details_captured_by: string | null;
}

type QueueTab = "queue" | "attended" | "journey";
type QueueAction = "mark_paid" | "unpay" | "attend" | "unattend" | "claim" | "release" | "details_done" | "details_undone";

// How long a colleague's open-client soft-lock stays "live" before we treat it
// as stale (they likely closed the tab without releasing it).
const LOCK_TTL_MS = 10 * 60 * 1000;

function lockIsFresh(since: string | null): boolean {
  if (!since) return false;
  return Date.now() - new Date(since).getTime() < LOCK_TTL_MS;
}

/** A short, readable name for a staff member from their email (before the @). */
function actorLabel(email: string | null): string {
  if (!email) return "a colleague";
  return email.split("@")[0] || email;
}

const REFERRAL_LABEL: Record<string, string> = {
  self: "Self referred",
  doctor: "Referred by doctor / hospital",
  hmo: "Referred by HMO",
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Transfer",
  bill_hospital: "Bill to hospital",
  hmo: "HMO",
};

/**
 * A plain-text summary of everything the client submitted — one field per line,
 * ready to paste into an external LIMS. Kept human-readable rather than CSV/JSON
 * so it drops cleanly into any patient form.
 */
function buildCopyText(r: QueueReq): string {
  const lines: [string, string | null | undefined][] = [
    ["Name", r.patient_name],
    ["Phone", r.patient_phone],
    ["WhatsApp", r.whatsapp_phone],
    ["Email", r.patient_email],
    ["Age", r.patient_age != null ? `${r.patient_age}` : null],
    ["Sex", r.sex],
    ["Date of birth", r.dob],
    ["Address", r.address],
    ["Referral", r.referral_type ? (REFERRAL_LABEL[r.referral_type] ?? r.referral_type) : null],
    ["Referring doctor", r.referral_type !== "self" ? r.doctor_name : null],
    ["Hospital / HMO", r.doctor_hospital],
    ["Policy number", r.policy_number],
    ["Payment mode", r.payment_mode ? (PAYMENT_LABEL[r.payment_mode] ?? r.payment_mode) : null],
    ["Complaint", r.diagnosis],
    ["Tests", testNames(r).join(", ") || null],
    ["Referral form", r.test_image_url],
    ["Code", r.code],
  ];
  return lines.filter(([, v]) => v != null && String(v).trim() !== "").map(([k, v]) => `${k}: ${String(v).trim()}`).join("\n");
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function fmtNaira(n: number): string {
  return "₦" + Math.round(n).toLocaleString();
}

/** Per-test estimated cost rows from the resolved breakdown. */
function estRows(r: QueueReq): { name: string; price: number | null }[] {
  const items = Array.isArray(r.test_breakdown)
    ? (r.test_breakdown as { raw?: string; canonical_name?: string; unit_price?: number }[])
    : [];
  return items
    .map((it) => ({ name: it.canonical_name || it.raw || "", price: typeof it.unit_price === "number" ? it.unit_price : null }))
    .filter((x) => x.name);
}

function testNames(r: QueueReq): string[] {
  const rows = estRows(r);
  if (rows.length > 0) return rows.map((x) => x.name);
  return (r.tests || "").split(/[,\n]+/).map((s) => s.trim()).filter((s) => s && !s.toLowerCase().startsWith("notes:"));
}

/** Mini journey chips for a queue entry: In queue → Paid → Attended. */
function QueueStages({ r }: { r: QueueReq }) {
  const steps = [
    { label: "In queue", done: true },
    { label: "Paid", done: r.is_paid },
    { label: "Attended", done: !!r.attended_at },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.done ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-slate-500"}`}>
            {s.done ? <Check className="h-2.5 w-2.5" /> : <Hourglass className="h-2.5 w-2.5" />} {s.label}
          </span>
          {i < steps.length - 1 && <span className={`h-px w-3 ${steps[i + 1].done ? "bg-emerald-400/60" : "bg-white/15"}`} />}
        </div>
      ))}
    </div>
  );
}

/**
 * The waiting queue — every self-service and walk-in registration, first come,
 * first served. Waiting and paid clients share one tab (with a payment
 * filter); "Attended" holds the last 24h with undo; the LIMS-only "Journey"
 * sub-tab tracks samples through the pipeline. Tapping a client opens the
 * full detail popup.
 */
export function QueueView({
  canManage,
  lite,
  labId,
  labName,
  labSlug,
}: {
  canManage: boolean;
  lite: boolean;
  labId: string;
  labName: string;
  labSlug: string | null;
}) {
  const [waiting, setWaiting] = useState<QueueReq[]>([]);
  const [paid, setPaid] = useState<QueueReq[]>([]);
  const [attended, setAttended] = useState<QueueReq[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<QueueReq | null>(null);
  const [detailFor, setDetailFor] = useState<QueueReq | null>(null);
  const [tab, setTab] = useState<QueueTab>("queue");
  const [payF, setPayF] = useState<"" | "unpaid" | "paid">("");
  // Day filter — the queue is a daily affair, so "Today" leads; pick any
  // other date to review that day.
  const [dayF, setDayF] = useState<"today" | "all" | "date">("today");
  const [dayDate, setDayDate] = useState("");
  const [query, setQuery] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInTemplates, setWalkInTemplates] = useState<OnboardTemplate[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/lab/queue", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setMe(data.me ?? null);
      setWaiting(data.waiting ?? []);
      setPaid(data.paid ?? []);
      setAttended(data.attended ?? []);
    } catch {
      if (!silent) toast.error("Failed to load the queue");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll so new registrations surface without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) load(true); }, 15000);
    return () => clearInterval(id);
  }, [load]);

  const act = useCallback(async (requestId: string, action: QueueAction, okMsg: string) => {
    setBusyId(requestId);
    try {
      const res = await fetch("/api/lab/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      toast.success(okMsg);
      if (data.request) {
        setDetailFor((d) => (d && d.id === requestId ? { ...d, ...data.request } : d));
      }
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }, [load]);

  // Fire-and-forget queue writes (claim / release the soft-lock) — no toast,
  // no spinner; the 15s poll reconciles everyone's view.
  const quietAct = useCallback((requestId: string, action: QueueAction) => {
    fetch("/api/lab/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action }),
      keepalive: true,
    })
      .then(() => load(true))
      .catch(() => {});
  }, [load]);

  // Open a client. If a colleague already has them open (a fresh soft-lock),
  // warn first so two people don't work the same client at once.
  const openDetail = useCallback((r: QueueReq) => {
    if (r.attending_by && r.attending_by !== me && lockIsFresh(r.attending_since)) {
      const ok = window.confirm(
        `${r.patient_name || "This client"} is currently being attended to by ${actorLabel(r.attending_by)}.\n\nOpen anyway?`
      );
      if (!ok) return;
    }
    setDetailFor(r);
    if (canManage) quietAct(r.id, "claim");
  }, [me, canManage, quietAct]);

  const closeDetail = useCallback(() => {
    setDetailFor((cur) => {
      if (cur && canManage) quietAct(cur.id, "release");
      return null;
    });
  }, [canManage, quietAct]);

  function openWalkIn() {
    fetch("/api/lab/templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWalkInTemplates((d?.templates ?? []).map((t: { id: string; name: string; test_names: string[] }) => ({ id: t.id, name: t.name, test_names: t.test_names }))))
      .catch(() => {});
    setWalkInOpen(true);
  }

  const matches = useCallback((r: QueueReq) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [r.patient_name, r.patient_phone, r.patient_email, r.code, r.doctor_name, r.tests]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  }, [query]);

  const inDay = useCallback((r: QueueReq) => {
    if (dayF === "all") return true;
    const joined = new Date(r.queue_confirmed_at ?? r.created_at);
    const target = dayF === "today" ? new Date() : dayDate ? new Date(dayDate + "T12:00:00") : null;
    if (!target) return true;
    return joined.getFullYear() === target.getFullYear() && joined.getMonth() === target.getMonth() && joined.getDate() === target.getDate();
  }, [dayF, dayDate]);

  // One combined queue (waiting + paid) ordered by when each client joined.
  // Positions are live: when someone ahead is attended they leave the list
  // and everyone below moves up a number. Numbering restarts every calendar
  // day — yesterday's leftovers never push today's first client to #14.
  const { inQueue, positions } = useMemo(() => {
    const all = [...waiting, ...paid].sort((a, b) =>
      new Date(a.queue_confirmed_at ?? a.created_at).getTime() - new Date(b.queue_confirmed_at ?? b.created_at).getTime()
    );
    const pos = new Map<string, number>();
    const perDay = new Map<string, number>();
    for (const r of all) {
      const joined = new Date(r.queue_confirmed_at ?? r.created_at);
      const dayKey = `${joined.getFullYear()}-${joined.getMonth()}-${joined.getDate()}`;
      const n = (perDay.get(dayKey) ?? 0) + 1;
      perDay.set(dayKey, n);
      pos.set(r.id, n);
    }
    return {
      positions: pos,
      inQueue: all.filter(inDay).filter((r) => {
        if (payF === "unpaid" && r.is_paid) return false;
        if (payF === "paid" && !r.is_paid) return false;
        return matches(r);
      }),
    };
  }, [waiting, paid, payF, matches, inDay]);

  const attendedShown = useMemo(() => attended.filter((r) => inDay(r) && matches(r)), [attended, matches, inDay]);

  // Tab count badges reflect the selected day filter (so "Today" shows today's
  // totals), independent of the within-tab payment filter and search.
  const queueDayCount = useMemo(() => [...waiting, ...paid].filter(inDay).length, [waiting, paid, inDay]);
  const attendedDayCount = useMemo(() => attended.filter(inDay).length, [attended, inDay]);

  const TABS: { key: QueueTab; label: string; count: number | null; icon: React.ReactNode; show: boolean }[] = [
    { key: "queue", label: "In queue", count: queueDayCount, icon: <Hourglass className="h-3.5 w-3.5" />, show: true },
    { key: "attended", label: "Attended", count: attendedDayCount, icon: <UserCheck className="h-3.5 w-3.5" />, show: true },
    { key: "journey", label: "Journey", count: null, icon: <Workflow className="h-3.5 w-3.5" />, show: !lite },
  ];

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>;
  }

  const rows = tab === "attended" ? attendedShown : inQueue;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Queue</h2>
          <p className="mt-1 text-sm text-slate-400">Self-service and walk-in clients, served in order of arrival. Each client keeps their queue number.</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={openWalkIn}
              className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-medical-700"
            >
              <UserPlus className="h-3.5 w-3.5" /> Register walk-in
            </button>
          )}
          <button
            onClick={() => load(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === t.key ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
          >
            {t.icon} {t.label}
            {t.count != null && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.key ? "bg-white/20 text-white" : "bg-white/10 text-slate-400"}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "journey" ? (
        <JourneyView canAdvance={canManage} />
      ) : (
        <>
          {/* Search + payment filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, phone, email, code or test"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none"
              />
            </div>
            {tab === "queue" && (
              <select
                value={payF}
                onChange={(e) => setPayF(e.target.value as typeof payF)}
                className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none"
              >
                <option value="" className="bg-slate-800">All</option>
                <option value="unpaid" className="bg-slate-800">Waiting (unpaid)</option>
                <option value="paid" className="bg-slate-800">Paid</option>
              </select>
            )}
            <select
              value={dayF}
              onChange={(e) => setDayF(e.target.value as typeof dayF)}
              className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none"
            >
              <option value="today" className="bg-slate-800">Today</option>
              <option value="date" className="bg-slate-800">Pick a date</option>
              <option value="all" className="bg-slate-800">All days</option>
            </select>
            {dayF === "date" && (
              <input
                type="date"
                value={dayDate}
                onChange={(e) => setDayDate(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 outline-none"
              />
            )}
          </div>

          {rows.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 py-14 text-center">
              <QrCode className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-300">
                {query || payF ? "No matches" : tab === "queue" ? "The queue is empty" : dayF === "today" ? "No one attended today yet" : "No one attended in this period"}
              </p>
              {!query && tab === "queue" && <p className="mt-1 text-xs text-slate-500">Clients who register via your QR portal or the walk-in form appear here instantly.</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(r)}
                  onKeyDown={(e) => { if (e.key === "Enter") openDetail(r); }}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${tab === "attended" ? "border-white/5 bg-white/3 hover:bg-white/6" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                >
                  <div className="flex items-start gap-3">
                    {tab !== "attended" ? (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-medical-600/25 text-base font-bold text-medical-200" title="Live queue position — moves up as clients ahead are attended to">
                        {positions.get(r.id) ?? "•"}
                      </span>
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                        <Check className="h-5 w-5 text-emerald-400" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                        <SourceBadge source={r.source} />
                        {r.patient_phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {r.patient_phone.split(",")[0]}</span>}
                        {r.doctor_name && r.referral_type !== "self" && (
                          <span className="inline-flex items-center gap-1"><Stethoscope className="h-3 w-3" /> {r.doctor_name}</span>
                        )}
                        {r.payment_mode && <span>Pays: {PAYMENT_LABEL[r.payment_mode] ?? r.payment_mode}</span>}
                        <span>{tab === "attended" ? `Attended at ${fmtTime(r.attended_at)}` : `Joined ${timeAgo(r.queue_confirmed_at ?? r.created_at)}`}</span>
                      </div>
                      {(r.details_captured_at || r.test_image_url || (r.attending_by && lockIsFresh(r.attending_since))) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {r.test_image_url && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-300">
                              <FileText className="h-2.5 w-2.5" /> Referral form
                            </span>
                          )}
                          {r.attending_by && lockIsFresh(r.attending_since) && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                              <Eye className="h-2.5 w-2.5" /> {r.attending_by === me ? "You're attending" : `${actorLabel(r.attending_by)} is attending`}
                            </span>
                          )}
                          {r.details_captured_at && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                              <ClipboardCheck className="h-2.5 w-2.5" /> Details captured
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-2"><QueueStages r={r} /></div>
                    </div>
                    <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-slate-500" />
                  </div>
                  {canManage && (
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-white/5 pt-3" onClick={(e) => e.stopPropagation()}>
                      {tab === "queue" && !r.is_paid && (
                        <button
                          onClick={() => act(r.id, "mark_paid", `${r.patient_name || "Client"} marked paid`)}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
                        >
                          {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Payment made
                        </button>
                      )}
                      {tab === "queue" && r.is_paid && (
                        <button
                          onClick={() => act(r.id, "unpay", "Payment status undone")}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
                          title="Undo payment"
                        >
                          <Undo2 className="h-3 w-3" /> Undo paid
                        </button>
                      )}
                      {/* Attended is only offered once payment has been recorded. */}
                      {tab === "queue" ? (
                        r.is_paid && (
                          <button
                            onClick={() => act(r.id, "attend", `${r.patient_name || "Client"} marked as attended`)}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Attended
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => act(r.id, "unattend", "Returned to the queue")}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
                        >
                          <Undo2 className="h-3 w-3" /> Undo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Walk-in registration — same form as the QR self-service page */}
      {walkInOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setWalkInOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Register walk-in</h3>
              <button onClick={() => setWalkInOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <LabOnboardForm
              lab={{ id: labId, name: labName, slug: labSlug ?? undefined }}
              source="walk_in"
              templates={walkInTemplates}
              onSuccess={() => { setTimeout(() => { setWalkInOpen(false); load(true); }, 1800); }}
            />
          </div>
        </div>
      )}

      {detailFor && (
        <QueueDetailModal
          request={detailFor}
          position={positions.get(detailFor.id) ?? null}
          canManage={canManage}
          lite={lite}
          me={me}
          busy={busyId === detailFor.id}
          onAction={(action, msg) => act(detailFor.id, action, msg)}
          onEdit={() => { setEditFor(detailFor); setDetailFor(null); }}
          onClose={closeDetail}
        />
      )}

      {editFor && (
        <QueueEditModal
          request={editFor}
          labId={labId}
          onClose={() => { if (canManage) quietAct(editFor.id, "release"); setEditFor(null); }}
          onDone={() => { if (canManage) quietAct(editFor.id, "release"); setEditFor(null); load(true); }}
        />
      )}
    </div>
  );
}

const menuItemCls = "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50";

/**
 * A compact "More" dropdown for the detail modal's secondary actions. Opens
 * upward (the footer sits at the bottom of the popup) and renders nothing when
 * it has no actionable children.
 */
function ActionMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const items = Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5"
      >
        <MoreHorizontal className="h-3.5 w-3.5" /> More
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 z-20 mb-1 w-52 overflow-hidden rounded-xl border border-white/10 bg-slate-800 py-1 shadow-xl" onClick={() => setOpen(false)}>
            {items}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Copies one field on its own so the desk can paste it straight into the
 * matching LIMS box. Text goes to the clipboard in block capitals — exactly as
 * the popup shows it — and the icon flips to a tick for a moment as a receipt.
 */
function CopyValueButton({ text, label, className = "p-1.5" }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text.trim().toUpperCase());
      setCopied(true);
    } catch {
      toast.error("Couldn't copy — please try again");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${label.toLowerCase()}`}
      aria-label={`Copy ${label.toLowerCase()}`}
      className={`shrink-0 rounded-lg border transition ${className} ${copied ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400 hover:bg-white/10 hover:text-white"}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * One label/value line of the detail popup. Everything the client submitted
 * reads in block capitals — the way the desk transcribes it onto request forms.
 * `copy` is the plain text behind the value; give it to any field that gets
 * re-keyed into the LIMS and the line grows its own copy button.
 *
 * Lives at module scope so the queue's background refresh can't remount the
 * rows and wipe a copy button's "copied" tick mid-flash.
 */
function DetailRow({ label, value, copy }: { label: string; value: React.ReactNode; copy?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 border-b border-white/5 py-2.5 last:border-0 sm:flex-row sm:items-start">
      <p className="w-44 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <div className="min-w-0 flex-1 text-sm uppercase text-slate-200">{value}</div>
        {copy && copy.trim() !== "" && <CopyValueButton text={copy} label={label} />}
      </div>
    </div>
  );
}

/** Fullscreen client detail popup — everything the client submitted, plus actions. */
function QueueDetailModal({
  request: r,
  position,
  canManage,
  lite,
  me,
  busy,
  onAction,
  onEdit,
  onClose,
}: {
  request: QueueReq;
  position: number | null;
  canManage: boolean;
  /** Lite / micro mode tucks the checklist + edit under a "More" menu so only one primary action shows. */
  lite: boolean;
  me: string | null;
  busy: boolean;
  onAction: (action: QueueAction, okMsg: string) => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const [showEstimate, setShowEstimate] = useState(false);
  const rows = estRows(r);
  const total = r.quoted_price ?? rows.reduce((s, x) => s + (x.price ?? 0), 0);
  const names = testNames(r);
  const attended = !!r.attended_at;
  const detailsCaptured = !!r.details_captured_at;
  const attendingByOther = !!r.attending_by && r.attending_by !== me && lockIsFresh(r.attending_since);
  const checklistUrl = `/api/lab/requests/${r.id}/checklist-pdf`;

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(buildCopyText(r));
      toast.success("Client details copied — paste into your LIMS");
    } catch {
      toast.error("Couldn't copy — please try again");
    }
  }

  // Pre-resolved so the label a staffer reads is exactly what the copy button
  // puts on the clipboard.
  const referralLabel = r.referral_type ? (REFERRAL_LABEL[r.referral_type] ?? r.referral_type) : null;
  const doctorLabel = r.referral_type !== "self" ? r.doctor_name : null;
  const paymentLabel = r.payment_mode ? (PAYMENT_LABEL[r.payment_mode] ?? r.payment_mode) : null;
  const joinedLabel = fmtDateTime(r.queue_confirmed_at ?? r.created_at);
  const attendedLabel = r.attended_at ? fmtDateTime(r.attended_at) : null;

  return (
    <FullViewModal
      title={<span><span className="uppercase">{r.patient_name || "Unnamed"}</span> {position != null && <span className="ml-1 rounded-full bg-medical-600/25 px-2 py-0.5 text-xs font-bold text-medical-200" title="Live queue position">#{position}</span>}</span>}
      subtitle={`${r.code} · joined ${timeAgo(r.queue_confirmed_at ?? r.created_at)}`}
      maxWidth="max-w-3xl"
      onClose={onClose}
    >
      <div className="space-y-5">
        <QueueStages r={r} />

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4">
          <DetailRow label="Name" value={r.patient_name} copy={r.patient_name} />
          <DetailRow label="Source" value={<SourceBadge source={r.source} />} />
          <DetailRow label="Phone" value={r.patient_phone && (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {r.patient_phone.split(",").map((p) => (
                <a key={p} href={`tel:${p.trim()}`} className="inline-flex items-center gap-1 text-medical-300 hover:text-medical-200"><Phone className="h-3.5 w-3.5" /> {p.trim()}</a>
              ))}
            </span>
          )} copy={r.patient_phone} />
          <DetailRow label="WhatsApp" value={r.whatsapp_phone && (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {r.whatsapp_phone.split(",").map((p) => (
                <span key={p} className="inline-flex items-center gap-1 text-emerald-300"><MessageCircle className="h-3.5 w-3.5" /> {p.trim()}</span>
              ))}
            </span>
          )} copy={r.whatsapp_phone} />
          <DetailRow label="Email" value={r.patient_email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" /> {r.patient_email}</span>} copy={r.patient_email} />
          {/* Age and sex get a row each so either can be pasted on its own. */}
          <DetailRow label="Age" value={r.patient_age != null ? `${r.patient_age} yrs` : null} copy={r.patient_age != null ? `${r.patient_age}` : null} />
          <DetailRow label="Sex" value={r.sex} copy={r.sex} />
          <DetailRow label="Date of birth" value={r.dob} copy={r.dob} />
          <DetailRow label="Address" value={r.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {r.address}</span>} copy={r.address} />
          <DetailRow label="Referral" value={referralLabel} copy={referralLabel} />
          <DetailRow label="Referring doctor" value={doctorLabel} copy={doctorLabel} />
          <DetailRow label="Hospital / HMO" value={r.doctor_hospital} copy={r.doctor_hospital} />
          <DetailRow label="Policy number" value={r.policy_number} copy={r.policy_number} />
          <DetailRow label="Payment mode" value={paymentLabel} copy={paymentLabel} />
          <DetailRow label="Complaint" value={r.diagnosis} copy={r.diagnosis} />
          <DetailRow label="Poveon code" value={r.code} copy={r.code} />
          <DetailRow label="Joined queue" value={joinedLabel} copy={joinedLabel} />
          <DetailRow label="Attended" value={attendedLabel} copy={attendedLabel} />
        </div>

        {/* Tests + optional price estimate */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tests / investigations</p>
            <button
              onClick={() => setShowEstimate((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${showEstimate ? "bg-amber-500/15 text-amber-300" : "border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"}`}
            >
              {showEstimate ? "Hide price estimate" : "Show price estimate"}
            </button>
          </div>
          {names.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No tests yet — to be confirmed at the desk.</p>
          ) : showEstimate && rows.length > 0 ? (
            <div className="mt-3 space-y-1 text-sm">
              {rows.map((x, i) => (
                <div key={i} className="flex items-center gap-2 text-slate-300">
                  <span className="min-w-0 truncate uppercase">{x.name}</span>
                  <CopyValueButton text={x.name} label="test name" className="p-1" />
                  <span className="ml-auto shrink-0 tabular-nums">{x.price != null ? fmtNaira(x.price) : "—"}</span>
                </div>
              ))}
              {total > 0 && (
                <div className="flex justify-between border-t border-white/10 pt-2 font-semibold text-white">
                  <span>Estimated total</span><span className="tabular-nums">{fmtNaira(total)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {names.map((n, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1 pl-2.5 pr-1 text-xs uppercase text-slate-200">
                  {n}
                  <CopyValueButton text={n} label="test name" className="p-1" />
                </span>
              ))}
            </div>
          )}
          {showEstimate && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200/80">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              Estimate only — prices and detected tests may not be accurate. Please verify against the price list before billing.
            </p>
          )}
        </div>

        {/* The client's own referral form, shown full-width so the desk can read
            the tests straight off it. */}
        {r.test_image_url && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <FileText className="h-3.5 w-3.5" /> Referral form
              </p>
              <a href={r.test_image_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-medical-300 hover:bg-white/5">
                <ExternalLink className="h-3.5 w-3.5" /> Open full size
              </a>
            </div>
            <a href={r.test_image_url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.test_image_url}
                alt="Referral form the client submitted"
                className="max-h-[28rem] w-full rounded-xl bg-white object-contain"
              />
            </a>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3 border-t border-white/10 pt-4">
          {attendingByOther && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <Eye className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>Heads up — {actorLabel(r.attending_by)} also has this client open. Coordinate so the details aren&apos;t entered twice.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Copy everything for an external LIMS — one tap, every mode. */}
            <button onClick={copyDetails} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5">
              <Copy className="h-3.5 w-3.5" /> Copy for LIMS
            </button>

            {/* In LIMS mode the checklist + edit stay in reach; lite/micro tuck them into More. */}
            {!lite && (
              <a href={checklistUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-medical-300 hover:bg-white/5">
                <Printer className="h-3.5 w-3.5" /> Print visit checklist
              </a>
            )}
            {!lite && canManage && (
              <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5">
                <Pencil className="h-3.5 w-3.5" /> Edit details
              </button>
            )}

            {canManage && (
              <>
                {/* "Done inputting" marker — stops two people re-keying the same client. */}
                {detailsCaptured ? (
                  <button onClick={() => onAction("details_undone", "Details capture undone")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-50">
                    <ClipboardCheck className="h-3.5 w-3.5" /> Details captured
                  </button>
                ) : (
                  <button onClick={() => onAction("details_done", "Marked as details captured")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50">
                    <ClipboardCheck className="h-3.5 w-3.5" /> Mark details captured
                  </button>
                )}

                {/* Exactly one primary next-step call to action at a time. */}
                {!attended && !r.is_paid && (
                  <button onClick={() => onAction("mark_paid", `${r.patient_name || "Client"} marked paid`)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Payment made
                  </button>
                )}
                {!attended && r.is_paid && (
                  <button onClick={() => onAction("attend", `${r.patient_name || "Client"} marked as attended`)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Attended
                  </button>
                )}

                {/* Everything low-frequency (undos + the lite-hidden actions) lives here. */}
                <ActionMenu>
                  {lite && (
                    <a href={checklistUrl} target="_blank" rel="noreferrer" className={menuItemCls}>
                      <Printer className="h-3.5 w-3.5" /> Print visit checklist
                    </a>
                  )}
                  {lite && (
                    <button onClick={onEdit} className={menuItemCls}>
                      <Pencil className="h-3.5 w-3.5" /> Edit details
                    </button>
                  )}
                  {r.is_paid && !attended && (
                    <button onClick={() => onAction("unpay", "Payment status undone")} disabled={busy} className={menuItemCls}>
                      <Undo2 className="h-3.5 w-3.5" /> Undo paid
                    </button>
                  )}
                  {attended && (
                    <button onClick={() => onAction("unattend", "Returned to the queue")} disabled={busy} className={menuItemCls}>
                      <Undo2 className="h-3.5 w-3.5" /> Return to queue
                    </button>
                  )}
                </ActionMenu>
              </>
            )}

            {/* View-only staff in lite mode still get the checklist via More. */}
            {lite && !canManage && (
              <ActionMenu>
                <a href={checklistUrl} target="_blank" rel="noreferrer" className={menuItemCls}>
                  <Printer className="h-3.5 w-3.5" /> Print visit checklist
                </a>
              </ActionMenu>
            )}
          </div>
        </div>
      </div>
    </FullViewModal>
  );
}

/**
 * Fullscreen edit popup — the lab reviews and corrects everything the client
 * typed, directly on the queue.
 */
function QueueEditModal({
  request,
  labId,
  onClose,
  onDone,
}: {
  request: QueueReq;
  labId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(request.patient_name ?? "");
  const [phone, setPhone] = useState(request.patient_phone ?? "");
  // If no separate WhatsApp number was given, it's the same as the phone —
  // duplicate it so the field is explicit and editable.
  const [whatsapp, setWhatsapp] = useState(request.whatsapp_phone || request.patient_phone || "");
  const [email, setEmail] = useState(request.patient_email ?? "");
  const [age, setAge] = useState(request.patient_age != null ? String(request.patient_age) : "");
  const [sex, setSex] = useState((request.sex ?? "").toLowerCase());
  const [referralType, setReferralType] = useState(request.referral_type ?? "self");
  const [doctorName, setDoctorName] = useState(request.referral_type && request.referral_type !== "self" ? (request.doctor_name ?? "") : "");
  const [org, setOrg] = useState(request.doctor_hospital ?? "");
  const [policyNumber, setPolicyNumber] = useState(request.policy_number ?? "");
  const [paymentMode, setPaymentMode] = useState(request.payment_mode ?? "");
  // Proper catalog test picker — seeded from the resolved breakdown so
  // recognised tests keep their catalog link (same as the onboarding editor).
  const [tests, setTests] = useState<TestTag[]>(() => {
    const bd = Array.isArray(request.test_breakdown)
      ? (request.test_breakdown as { raw?: string; canonical_name?: string; category?: string; unit_price?: number; source?: string; lab_offered_test_id?: string | null }[])
      : [];
    if (bd.length > 0) {
      return bd
        .map((it): TestTag => {
          const recognized = it.source === "lab_catalog";
          return {
            name: it.canonical_name || it.raw || "",
            catalog_test_id: recognized ? (it.lab_offered_test_id ?? null) : null,
            price: it.unit_price,
            category: it.category,
            low_confidence: !recognized,
          };
        })
        .filter((t) => t.name);
    }
    return (request.tests || "")
      .split(/[,\n]+/)
      .map((x) => x.trim())
      .filter((x) => x && !x.toLowerCase().startsWith("notes:") && x.toLowerCase() !== "to be confirmed at the lab")
      .map((n) => ({ name: n, catalog_test_id: null }));
  });
  const [complaint, setComplaint] = useState(request.diagnosis ?? "");
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";
  const labelCls = "mb-1 block text-xs font-medium text-slate-400";

  async function save() {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/lab/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          action: "confirm",
          edits: {
            patient_name: name,
            patient_phone: phone,
            patient_email: email,
            patient_age: age.trim() === "" ? null : Number(age),
            sex,
            whatsapp_phone: whatsapp,
            payment_mode: (paymentMode || null) as "cash" | "card" | "transfer" | "bill_hospital" | "hmo" | null,
            referral_type: (referralType || null) as "self" | "doctor" | "hmo" | null,
            doctor_name: doctorName,
            doctor_hospital: org,
            policy_number: policyNumber,
            diagnosis: complaint,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");

      // Tests go through the dedicated endpoint so the catalog breakdown and
      // department tracks are recomputed.
      if (tests.length > 0) {
        const tRes = await fetch("/api/lab/requests/update-tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: request.id, tests: tests.map((t) => t.name).join(", ") }),
        });
        const tData = await tRes.json();
        if (!tRes.ok || tData.success === false) throw new Error(tData.error || "Details saved, but the tests could not be updated");
      }

      toast.success("Details updated");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FullViewModal
      title="Edit queue entry"
      subtitle={`${request.code} · joined ${timeAgo(request.queue_confirmed_at ?? request.created_at)}`}
      maxWidth="max-w-3xl"
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-400">Correct any of the client&apos;s details below and save — their queue position is unchanged. Separate multiple numbers with commas.</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Full name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Phone number(s)</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+234 803…, +234 705…" />
          </div>
          <div>
            <label className={labelCls}>WhatsApp number(s)</label>
            <input className={inputCls} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder="+234 803…" />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Age</label>
              <input className={inputCls} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
            </div>
            <div>
              <label className={labelCls}>Sex</label>
              <select className={inputCls} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="" className="bg-slate-800">—</option>
                <option value="male" className="bg-slate-800">Male</option>
                <option value="female" className="bg-slate-800">Female</option>
                <option value="other" className="bg-slate-800">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Referral</label>
            <select className={inputCls} value={referralType} onChange={(e) => setReferralType(e.target.value)}>
              <option value="self" className="bg-slate-800">Self referred</option>
              <option value="doctor" className="bg-slate-800">Referred by doctor / hospital</option>
              <option value="hmo" className="bg-slate-800">Referred by HMO</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Payment mode</label>
            <select className={inputCls} value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="" className="bg-slate-800">—</option>
              <option value="cash" className="bg-slate-800">Cash</option>
              <option value="card" className="bg-slate-800">Card</option>
              <option value="transfer" className="bg-slate-800">Transfer</option>
              <option value="hmo" className="bg-slate-800">HMO</option>
              <option value="bill_hospital" className="bg-slate-800">Bill to hospital / HMO</option>
            </select>
          </div>
          {referralType === "doctor" && (
            <>
              <div>
                <label className={labelCls}>Referring doctor</label>
                <input className={inputCls} value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Referring hospital</label>
                <input className={inputCls} value={org} onChange={(e) => setOrg(e.target.value)} />
              </div>
            </>
          )}
          {referralType === "hmo" && (
            <>
              <div>
                <label className={labelCls}>Name of HMO</label>
                <input className={inputCls} value={org} onChange={(e) => setOrg(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Policy number</label>
                <input className={inputCls} value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Referring doctor (optional)</label>
                <input className={inputCls} value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <label className={labelCls}>Tests / investigations</label>
            <TestTagInput value={tests} onChange={setTests} labId={labId} />
            <p className="mt-1 text-[11px] text-slate-500">Search your catalog or type a test and press Enter. Department tracks update automatically.</p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Complaint</label>
            <textarea className={inputCls} rows={2} value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="What the client said is wrong" />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
          <button onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-medical-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>
    </FullViewModal>
  );
}
