"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Check, Search, RefreshCw, Pencil, Phone, Undo2, QrCode, MessageCircle, CreditCard, Stethoscope, Hourglass, UserCheck, UserPlus, X, Printer, AlertTriangle, Workflow, Mail, MapPin, ChevronRight } from "lucide-react";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { FullViewModal } from "@/components/ui/FullViewModal";
import { LabOnboardForm, OnboardTemplate } from "@/components/lab/LabOnboardForm";
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
}

type QueueTab = "queue" | "attended" | "journey";
type QueueAction = "mark_paid" | "unpay" | "attend" | "unattend";

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
};

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
  // and everyone below moves up a number.
  const { inQueue, positions } = useMemo(() => {
    const all = [...waiting, ...paid].sort((a, b) =>
      new Date(a.queue_confirmed_at ?? a.created_at).getTime() - new Date(b.queue_confirmed_at ?? b.created_at).getTime()
    );
    const dayList = all.filter(inDay);
    const pos = new Map<string, number>();
    dayList.forEach((r, i) => pos.set(r.id, i + 1));
    return {
      positions: pos,
      inQueue: dayList.filter((r) => {
        if (payF === "unpaid" && r.is_paid) return false;
        if (payF === "paid" && !r.is_paid) return false;
        return matches(r);
      }),
    };
  }, [waiting, paid, payF, matches, inDay]);

  const attendedShown = useMemo(() => attended.filter((r) => inDay(r) && matches(r)), [attended, matches, inDay]);

  const TABS: { key: QueueTab; label: string; count: number | null; icon: React.ReactNode; show: boolean }[] = [
    { key: "queue", label: "In queue", count: waiting.length + paid.length, icon: <Hourglass className="h-3.5 w-3.5" />, show: true },
    { key: "attended", label: "Attended", count: attended.length, icon: <UserCheck className="h-3.5 w-3.5" />, show: true },
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
                {query || payF ? "No matches" : tab === "queue" ? "The queue is empty" : "No one attended in the last 24h"}
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
                  onClick={() => setDetailFor(r)}
                  onKeyDown={(e) => { if (e.key === "Enter") setDetailFor(r); }}
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
                      {tab === "queue" ? (
                        <button
                          onClick={() => act(r.id, "attend", `${r.patient_name || "Client"} marked as attended`)}
                          disabled={busyId === r.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Attended
                        </button>
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
          busy={busyId === detailFor.id}
          onAction={(action, msg) => act(detailFor.id, action, msg)}
          onEdit={() => { setEditFor(detailFor); setDetailFor(null); }}
          onClose={() => setDetailFor(null)}
        />
      )}

      {editFor && (
        <QueueEditModal
          request={editFor}
          onClose={() => setEditFor(null)}
          onDone={() => { setEditFor(null); load(true); }}
        />
      )}
    </div>
  );
}

/** Fullscreen client detail popup — everything the client submitted, plus actions. */
function QueueDetailModal({
  request: r,
  position,
  canManage,
  busy,
  onAction,
  onEdit,
  onClose,
}: {
  request: QueueReq;
  position: number | null;
  canManage: boolean;
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

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) =>
    value ? (
      <div className="flex flex-col gap-0.5 border-b border-white/5 py-2.5 last:border-0 sm:flex-row sm:items-start">
        <p className="w-44 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <div className="text-sm text-slate-200">{value}</div>
      </div>
    ) : null;

  return (
    <FullViewModal
      title={<span>{r.patient_name || "Unnamed"} {position != null && <span className="ml-1 rounded-full bg-medical-600/25 px-2 py-0.5 text-xs font-bold text-medical-200" title="Live queue position">#{position}</span>}</span>}
      subtitle={`${r.code} · joined ${timeAgo(r.queue_confirmed_at ?? r.created_at)}`}
      maxWidth="max-w-3xl"
      onClose={onClose}
    >
      <div className="space-y-5">
        <QueueStages r={r} />

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4">
          <Row label="Source" value={<SourceBadge source={r.source} />} />
          <Row label="Phone" value={r.patient_phone && (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {r.patient_phone.split(",").map((p) => (
                <a key={p} href={`tel:${p.trim()}`} className="inline-flex items-center gap-1 text-medical-300 hover:text-medical-200"><Phone className="h-3.5 w-3.5" /> {p.trim()}</a>
              ))}
            </span>
          )} />
          <Row label="WhatsApp" value={r.whatsapp_phone && (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {r.whatsapp_phone.split(",").map((p) => (
                <span key={p} className="inline-flex items-center gap-1 text-emerald-300"><MessageCircle className="h-3.5 w-3.5" /> {p.trim()}</span>
              ))}
            </span>
          )} />
          <Row label="Email" value={r.patient_email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-slate-400" /> {r.patient_email}</span>} />
          <Row label="Age / Sex" value={[r.patient_age != null ? `${r.patient_age} yrs` : null, r.sex].filter(Boolean).join(" · ") || null} />
          <Row label="Date of birth" value={r.dob} />
          <Row label="Coming from" value={r.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {r.address}</span>} />
          <Row label="Referral" value={r.referral_type ? (REFERRAL_LABEL[r.referral_type] ?? r.referral_type) : null} />
          <Row label="Referring doctor" value={r.referral_type !== "self" ? r.doctor_name : null} />
          <Row label="Hospital / HMO" value={r.doctor_hospital} />
          <Row label="Policy number" value={r.policy_number} />
          <Row label="Payment mode" value={r.payment_mode ? (PAYMENT_LABEL[r.payment_mode] ?? r.payment_mode) : null} />
          <Row label="Complaint" value={r.diagnosis} />
          <Row label="Joined queue" value={fmtDateTime(r.queue_confirmed_at ?? r.created_at)} />
          <Row label="Attended" value={r.attended_at ? fmtDateTime(r.attended_at) : null} />
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
                <div key={i} className="flex justify-between gap-3 text-slate-300">
                  <span className="truncate">{x.name}</span>
                  <span className="shrink-0 tabular-nums">{x.price != null ? fmtNaira(x.price) : "—"}</span>
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
                <span key={i} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200">{n}</span>
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

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
          <a
            href={`/api/lab/requests/${r.id}/checklist-pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-medical-300 hover:bg-white/5"
          >
            <Printer className="h-3.5 w-3.5" /> Print visit checklist
          </a>
          {canManage && (
            <>
              <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5">
                <Pencil className="h-3.5 w-3.5" /> Edit details
              </button>
              {!attended && (r.is_paid ? (
                <button onClick={() => onAction("unpay", "Payment status undone")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-50">
                  <Undo2 className="h-3.5 w-3.5" /> Undo paid
                </button>
              ) : (
                <button onClick={() => onAction("mark_paid", `${r.patient_name || "Client"} marked paid`)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Payment made
                </button>
              ))}
              {attended ? (
                <button onClick={() => onAction("unattend", "Returned to the queue")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-50">
                  <Undo2 className="h-3.5 w-3.5" /> Return to queue
                </button>
              ) : (
                <button onClick={() => onAction("attend", `${r.patient_name || "Client"} marked as attended`)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Attended
                </button>
              )}
            </>
          )}
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
  onClose,
  onDone,
}: {
  request: QueueReq;
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
  const [testsText, setTestsText] = useState(request.tests);
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
            tests: testsText,
            whatsapp_phone: whatsapp,
            payment_mode: (paymentMode || null) as "cash" | "card" | "transfer" | "bill_hospital" | null,
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
            <textarea className={inputCls} rows={2} value={testsText} onChange={(e) => setTestsText(e.target.value)} />
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
