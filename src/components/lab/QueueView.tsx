"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Check, Search, RefreshCw, Pencil, Phone, Undo2, QrCode, MessageCircle, CreditCard, Stethoscope, ChevronDown, UserCheck, Hourglass, FlaskConical, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { FullViewModal } from "@/components/ui/FullViewModal";

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
}

type QueueTab = "waiting" | "paid" | "attended";

const REFERRAL_LABEL: Record<string, string> = {
  self: "Self referred",
  doctor: "Doctor / hospital",
  hmo: "HMO",
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

/** Mini journey stepper for a queue entry: In queue → Paid → Attended. */
function QueueJourney({ r }: { r: QueueReq }) {
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

/** Collapsed tests + estimated amount with an accuracy disclaimer. */
function TestsEstimate({ r }: { r: QueueReq }) {
  const [open, setOpen] = useState(false);
  const rows = estRows(r);
  const total = r.quoted_price ?? rows.reduce((s, x) => s + (x.price ?? 0), 0);
  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-white"
      >
        <FlaskConical className="h-3 w-3" /> Tests &amp; estimated amount
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
          {rows.length > 0 ? (
            <div className="space-y-1">
              {rows.map((x, i) => (
                <div key={i} className="flex justify-between gap-3 text-slate-300">
                  <span className="truncate">{x.name}</span>
                  <span className="shrink-0 tabular-nums">{x.price != null ? fmtNaira(x.price) : "—"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-300">{r.tests}</p>
          )}
          {total > 0 && (
            <div className="mt-2 flex justify-between border-t border-white/10 pt-2 font-semibold text-white">
              <span>Estimated total</span><span className="tabular-nums">{fmtNaira(total)}</span>
            </div>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-200/80">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            Estimate only — prices and detected tests may not be accurate. Staff should confirm before billing.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Self-service (QR) waiting queue. Registrations join the queue the moment
 * the client submits the form; the lab edits/adjusts details right on the
 * queue, records payment (moves the client to the Paid tab), and ticks them
 * off once attended — always first come, first served.
 */
export function QueueView({ canManage }: { canManage: boolean }) {
  const [waiting, setWaiting] = useState<QueueReq[]>([]);
  const [paid, setPaid] = useState<QueueReq[]>([]);
  const [attended, setAttended] = useState<QueueReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editFor, setEditFor] = useState<QueueReq | null>(null);
  const [tab, setTab] = useState<QueueTab>("waiting");
  const [query, setQuery] = useState("");

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

  // Poll so new QR registrations surface without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) load(true); }, 15000);
    return () => clearInterval(id);
  }, [load]);

  const act = useCallback(async (requestId: string, action: "mark_paid" | "attend" | "unattend", okMsg: string) => {
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
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }, [load]);

  const matches = useCallback((r: QueueReq) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [r.patient_name, r.patient_phone, r.patient_email, r.code, r.doctor_name, r.tests]
      .filter(Boolean).join(" ").toLowerCase().includes(q);
  }, [query]);

  const lists: Record<QueueTab, QueueReq[]> = useMemo(() => ({
    waiting: waiting.filter(matches),
    paid: paid.filter(matches),
    attended: attended.filter(matches),
  }), [waiting, paid, attended, matches]);

  const TABS: { key: QueueTab; label: string; count: number; icon: React.ReactNode }[] = [
    { key: "waiting", label: "Waiting", count: waiting.length, icon: <Hourglass className="h-3.5 w-3.5" /> },
    { key: "paid", label: "Paid", count: paid.length, icon: <CreditCard className="h-3.5 w-3.5" /> },
    { key: "attended", label: "Attended", count: attended.length, icon: <UserCheck className="h-3.5 w-3.5" /> },
  ];

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>;
  }

  const rows = lists[tab];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Queue</h2>
          <p className="mt-1 text-sm text-slate-400">Clients from your QR self-service portal join here automatically — served in order of arrival.</p>
        </div>
        <button
          onClick={() => load(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Stage tabs — the queue's journey: Waiting → Paid → Attended */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${tab === t.key ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
          >
            {t.icon} {t.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === t.key ? "bg-white/20 text-white" : "bg-white/10 text-slate-400"}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, email, code or test"
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none"
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-14 text-center">
          <QrCode className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <p className="text-sm font-medium text-slate-300">
            {query ? "No matches in this tab" : tab === "waiting" ? "No one is waiting" : tab === "paid" ? "No paid clients waiting" : "No one attended in the last 24h"}
          </p>
          {!query && tab === "waiting" && <p className="mt-1 text-xs text-slate-500">Clients who register via your QR portal appear here instantly.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className={`rounded-2xl border p-4 transition ${tab === "attended" ? "border-white/5 bg-white/3" : "border-white/10 bg-white/5 hover:bg-white/8"}`}>
              <div className="flex items-start gap-3">
                {tab !== "attended" ? (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-medical-600/25 text-base font-bold text-medical-200" title="Queue position — first in, first served">
                    {i + 1}
                  </span>
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                    <Check className="h-5 w-5 text-emerald-400" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                    {r.patient_phone && (
                      <a href={`tel:${r.patient_phone}`} className="inline-flex items-center gap-1 text-medical-300 hover:text-medical-200"><Phone className="h-3 w-3" /> {r.patient_phone}</a>
                    )}
                    {(r.whatsapp_phone || r.patient_phone) && (
                      <span className="inline-flex items-center gap-1 text-emerald-400/80"><MessageCircle className="h-3 w-3" /> {r.whatsapp_phone || r.patient_phone}</span>
                    )}
                    {r.doctor_name && r.referral_type !== "self" && (
                      <span className="inline-flex items-center gap-1"><Stethoscope className="h-3 w-3" /> {r.doctor_name}</span>
                    )}
                    {r.referral_type && <span>{REFERRAL_LABEL[r.referral_type] ?? r.referral_type}{r.referral_type === "hmo" && r.policy_number ? ` · Policy ${r.policy_number}` : ""}</span>}
                    {r.payment_mode && <span>Pays: {PAYMENT_LABEL[r.payment_mode] ?? r.payment_mode}</span>}
                    <span>{tab === "attended" ? `Attended at ${fmtTime(r.attended_at)}` : `Joined ${timeAgo(r.created_at)}`}</span>
                  </div>
                  <div className="mt-2"><QueueJourney r={r} /></div>
                  <TestsEstimate r={r} />
                </div>
              </div>
              {canManage && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-white/5 pt-3">
                  {tab !== "attended" && (
                    <button
                      onClick={() => setEditFor(r)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-white/5 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" /> Edit details
                    </button>
                  )}
                  {tab === "waiting" && (
                    <button
                      onClick={() => act(r.id, "mark_paid", `${r.patient_name || "Client"} marked paid — moved to the Paid tab`)}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
                    >
                      {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Payment made
                    </button>
                  )}
                  {tab !== "attended" ? (
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
  const [whatsapp, setWhatsapp] = useState(request.whatsapp_phone ?? "");
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
      subtitle={`${request.code} · joined ${timeAgo(request.created_at)}`}
      maxWidth="max-w-3xl"
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-400">Correct any of the client&apos;s details below and save — their queue position is unchanged.</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>Full name *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
          <div>
            <label className={labelCls}>WhatsApp number</label>
            <input className={inputCls} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder="Same as phone if blank" />
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
