"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Check, RefreshCw, Pencil, Phone, Undo2, QrCode, ClipboardList, BellRing, MessageCircle, CreditCard, Stethoscope, ChevronDown } from "lucide-react";
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
  whatsapp_phone: string | null;
  payment_mode: string | null;
  is_paid: boolean;
  created_at: string;
  arrived_at: string | null;
  queue_confirmed_at: string | null;
  attended_at: string | null;
}

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

/**
 * Self-service (QR) waiting queue. New QR registrations land in "Awaiting
 * confirmation"; the lab confirms (and corrects) each one in a fullscreen
 * popup, which places the client into the first-come-first-served queue.
 * Ticking a client as attended moves them out of the queue.
 */
export function QueueView({ canManage }: { canManage: boolean }) {
  const [pending, setPending] = useState<QueueReq[]>([]);
  const [queued, setQueued] = useState<QueueReq[]>([]);
  const [attended, setAttended] = useState<QueueReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<QueueReq | null>(null);
  const [attendedOpen, setAttendedOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/lab/queue", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setPending(data.pending ?? []);
      setQueued(data.queued ?? []);
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

  const act = useCallback(async (requestId: string, action: "attend" | "unattend" | "return_to_pending", okMsg: string) => {
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

  const waitTimes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of queued) m.set(r.id, timeAgo(r.created_at));
    return m;
  }, [queued]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Queue</h2>
          <p className="mt-1 text-sm text-slate-400">Clients from your QR self-service portal, served in order of arrival.</p>
        </div>
        <button
          onClick={() => load(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <p className="text-xs font-medium text-amber-200/80">Awaiting confirmation</p>
          <p className="mt-1 text-2xl font-bold text-white">{pending.length}</p>
        </div>
        <div className="rounded-2xl border border-medical-500/30 bg-medical-600/15 p-4">
          <p className="text-xs font-medium text-medical-200">In queue</p>
          <p className="mt-1 text-2xl font-bold text-white">{queued.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <p className="text-xs font-medium text-emerald-200/80">Attended (24h)</p>
          <p className="mt-1 text-2xl font-bold text-white">{attended.length}</p>
        </div>
      </div>

      {/* Pending confirmations */}
      {pending.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
            <BellRing className="h-3.5 w-3.5" /> New registrations — confirm to add to the queue
          </p>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                    <p className="mt-0.5 truncate text-xs text-slate-300">{r.tests}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {r.referral_type && <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-medium text-violet-300">{REFERRAL_LABEL[r.referral_type] ?? r.referral_type}</span>}
                      {r.payment_mode && <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 font-medium text-sky-300"><CreditCard className="h-3 w-3" /> {PAYMENT_LABEL[r.payment_mode] ?? r.payment_mode}</span>}
                      <span className="text-slate-500">Registered {timeAgo(r.created_at)}</span>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => setConfirmFor(r)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-medical-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-medical-700"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Review &amp; confirm
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The queue */}
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <ClipboardList className="h-3.5 w-3.5" /> Waiting queue — first come, first served
        </p>
        {queued.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 py-14 text-center">
            <QrCode className="mx-auto mb-3 h-8 w-8 text-slate-500" />
            <p className="text-sm font-medium text-slate-300">The queue is empty</p>
            <p className="mt-1 text-xs text-slate-500">Clients who register via your QR portal appear here once confirmed.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {queued.map((r, i) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/8">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-medical-600/25 text-base font-bold text-medical-200" title="Queue position">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                  <p className="truncate text-xs text-slate-400">{r.tests}</p>
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
                    <span>Waiting {waitTimes.get(r.id)}</span>
                  </div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                    <button
                      onClick={() => setConfirmFor(r)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-white/5 hover:text-white"
                      title="Edit details"
                    >
                      <Pencil className="h-3 w-3" /> <span className="hidden sm:inline">Edit</span>
                    </button>
                    <button
                      onClick={() => act(r.id, "attend", `${r.patient_name || "Client"} marked as attended`)}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Attended
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attended (last 24h) — collapsible, with undo */}
      {attended.length > 0 && (
        <div>
          <button
            onClick={() => setAttendedOpen((v) => !v)}
            className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300/90 hover:text-emerald-200"
          >
            <Check className="h-3.5 w-3.5" /> Attended in the last 24h ({attended.length})
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${attendedOpen ? "rotate-180" : ""}`} />
          </button>
          {attendedOpen && (
            <div className="space-y-1.5">
              {attended.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/3 px-4 py-2.5">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-500">· {r.code}</span></p>
                    <p className="text-[10px] text-slate-500">Attended at {fmtTime(r.attended_at)}</p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => act(r.id, "unattend", "Returned to the queue")}
                      disabled={busyId === r.id}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
                      title="Undo — return to queue"
                    >
                      <Undo2 className="h-3 w-3" /> Undo
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirmFor && (
        <QueueConfirmModal
          request={confirmFor}
          onClose={() => setConfirmFor(null)}
          onDone={() => { setConfirmFor(null); load(true); }}
        />
      )}
    </div>
  );
}

/**
 * Fullscreen review popup — the lab checks (and corrects) everything the
 * client typed, then confirms them into the queue. Also used to edit a
 * client already in the queue.
 */
function QueueConfirmModal({
  request,
  onClose,
  onDone,
}: {
  request: QueueReq;
  onClose: () => void;
  onDone: () => void;
}) {
  const alreadyQueued = !!request.queue_confirmed_at;
  const [name, setName] = useState(request.patient_name ?? "");
  const [phone, setPhone] = useState(request.patient_phone ?? "");
  const [whatsapp, setWhatsapp] = useState(request.whatsapp_phone ?? "");
  const [email, setEmail] = useState(request.patient_email ?? "");
  const [age, setAge] = useState(request.patient_age != null ? String(request.patient_age) : "");
  const [sex, setSex] = useState((request.sex ?? "").toLowerCase());
  const [referralType, setReferralType] = useState(request.referral_type ?? "self");
  const [doctorName, setDoctorName] = useState(request.referral_type && request.referral_type !== "self" ? (request.doctor_name ?? "") : "");
  const [org, setOrg] = useState(request.doctor_hospital ?? "");
  const [paymentMode, setPaymentMode] = useState(request.payment_mode ?? "");
  const [testsText, setTestsText] = useState(request.tests);
  const [complaint, setComplaint] = useState(request.diagnosis ?? "");
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";
  const labelCls = "mb-1 block text-xs font-medium text-slate-400";

  async function confirm() {
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
            payment_mode: paymentMode || null,
            referral_type: (referralType || null) as "self" | "doctor" | "hmo" | null,
            doctor_name: doctorName,
            doctor_hospital: org,
            diagnosis: complaint,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      toast.success(alreadyQueued ? "Details updated" : "Added to the queue");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FullViewModal
      title={alreadyQueued ? "Edit queue entry" : "Confirm registration"}
      subtitle={`${request.code} · registered ${timeAgo(request.created_at)}`}
      maxWidth="max-w-3xl"
      onClose={onClose}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          {alreadyQueued
            ? "Correct any of the client's details below and save."
            : "Check the details the client entered, correct anything that's wrong, then confirm to place them in the queue."}
        </p>

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
          {referralType !== "self" && (
            <>
              <div>
                <label className={labelCls}>Referring doctor</label>
                <input className={inputCls} value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Hospital / HMO / company</label>
                <input className={inputCls} value={org} onChange={(e) => setOrg(e.target.value)} />
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
            onClick={confirm}
            disabled={saving || !name.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-medical-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {alreadyQueued ? "Save changes" : "Confirm & add to queue"}
          </button>
        </div>
      </div>
    </FullViewModal>
  );
}
