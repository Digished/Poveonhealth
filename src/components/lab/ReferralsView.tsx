"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, Plus, X, Wallet, Users, BadgeCheck, Search, Stethoscope, Send, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { StatCard } from "@/components/lab/StatCard";
import { FullViewModal } from "@/components/ui/FullViewModal";

interface RecentRef { code: string; patient_name: string | null; tests: string; status: string; created_at: string }
interface Professional {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  hospital: string | null;
  commission_type: string;
  commission_value: number;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  active: boolean;
  totals: { accrued: number; paid: number; count: number };
  referrals: { count: number; last_referral_at: string | null; recent: RecentRef[] };
}

const naira = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");

/**
 * Unified Referrals page — every referring professional in one place. Any doctor
 * who refers a client becomes a saved professional, searchable during client
 * registration. Shows referral volume alongside commission tracking, with an
 * "Add professional" action and a full-view referral history per professional.
 */
export function ReferralsView({ canManage = false }: { canManage?: boolean }) {
  const [pros, setPros] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Professional | null>(null);

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [hospital, setHospital] = useState("");
  const [ctype, setCtype] = useState<"percent" | "flat">("percent");
  const [cvalue, setCvalue] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/professionals", { cache: "no-store" });
      const data = await res.json();
      setPros(data.professionals ?? []);
    } catch {
      toast.error("Failed to load referrals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lab/professionals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          specialty: specialty.trim() || undefined,
          hospital: hospital.trim() || undefined,
          commission_type: ctype,
          commission_value: Number(cvalue) || 0,
          bank_name: bankName.trim() || undefined,
          account_number: accountNumber.trim() || undefined,
          account_name: accountName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Professional added");
      setShowForm(false);
      setName(""); setEmail(""); setPhone(""); setSpecialty(""); setHospital(""); setCvalue(""); setCtype("percent");
      setBankName(""); setAccountNumber(""); setAccountName("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  async function payAll(pro: Professional) {
    if (pro.totals.accrued <= 0) return;
    setPaying(pro.id);
    try {
      const res = await fetch("/api/lab/professionals/commissions/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professional_id: pro.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Settled ${data.paid} commission(s)`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to settle");
    } finally {
      setPaying(null);
    }
  }

  const totalAccrued = pros.reduce((s, p) => s + p.totals.accrued, 0);
  const totalPaid = pros.reduce((s, p) => s + p.totals.paid, 0);
  const totalReferrals = pros.reduce((s, p) => s + p.referrals.count, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? pros.filter((p) => [p.name, p.email, p.specialty, p.hospital].some((f) => (f ?? "").toLowerCase().includes(q)))
      : pros;
    // Most-active referrers first, then by outstanding commission.
    return [...list].sort((a, b) => b.referrals.count - a.referrals.count || b.totals.accrued - a.totals.accrued);
  }, [pros, query]);

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Referrals</h2>
        <p className="mt-1 text-sm text-slate-400">Every referring professional in one place. New referrals are saved automatically and can be searched when registering a client.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Professionals" value={pros.length} accent="medical" icon={<Users className="h-4 w-4" />} />
        <StatCard label="Referrals" value={totalReferrals} accent="violet" icon={<Stethoscope className="h-4 w-4" />} />
        <StatCard label="Outstanding" value={naira(totalAccrued)} accent="amber" icon={<Wallet className="h-4 w-4" />} hint="Accrued, unpaid" />
        <StatCard label="Paid out" value={naira(totalPaid)} accent="emerald" icon={<BadgeCheck className="h-4 w-4" />} />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, specialty or hospital" className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none" />
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700">
            <Plus className="h-4 w-4" /> Add professional
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-16 text-center text-slate-400">
          {query ? "No professionals match your search." : "No referrals yet. Add a professional or register a client with a referring doctor."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <button key={p.id} onClick={() => setDetail(p)} className="block w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{p.name}{!p.active && <span className="ml-2 text-xs text-slate-500">(inactive)</span>}</p>
                  <p className="truncate text-xs text-slate-400">{[p.specialty, p.hospital, p.email].filter(Boolean).join(" · ") || "—"}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                      <Stethoscope className="h-3 w-3" /> {p.referrals.count} referral{p.referrals.count === 1 ? "" : "s"}
                    </span>
                    {p.referrals.last_referral_at && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                        <Clock className="h-3 w-3" /> last {fmtDate(p.referrals.last_referral_at)}
                      </span>
                    )}
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-medical-300">
                      {p.commission_value > 0 ? (p.commission_type === "percent" ? `${p.commission_value}%` : `${naira(p.commission_value)}/ref`) : "no commission"}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-400">Outstanding</p>
                  <p className="text-lg font-bold text-amber-300">{naira(p.totals.accrued)}</p>
                  <p className="text-[11px] text-slate-500">{naira(p.totals.paid)} paid</p>
                </div>
              </div>
              {canManage && p.totals.accrued > 0 && (
                <span
                  onClick={(e) => { e.stopPropagation(); payAll(p); }}
                  className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  {paying === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                  Mark {naira(p.totals.accrued)} paid
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Per-professional referral history (full view) */}
      {detail && (
        <FullViewModal
          title={detail.name}
          subtitle={[detail.specialty, detail.hospital].filter(Boolean).join(" · ") || detail.email || undefined}
          maxWidth="max-w-3xl"
          onClose={() => setDetail(null)}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Referrals" value={detail.referrals.count} accent="violet" />
            <StatCard label="Outstanding" value={naira(detail.totals.accrued)} accent="amber" />
            <StatCard label="Paid" value={naira(detail.totals.paid)} accent="emerald" />
            <StatCard label="Commission" value={detail.commission_value > 0 ? (detail.commission_type === "percent" ? `${detail.commission_value}%` : naira(detail.commission_value)) : "—"} accent="medical" />
          </div>

          {(detail.bank_name || detail.account_number) && (
            <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
              Payout: {[detail.bank_name, detail.account_number, detail.account_name].filter(Boolean).join(" · ")}
            </p>
          )}

          <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent referrals</p>
          {detail.referrals.recent.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 py-8 text-center text-sm text-slate-400">No referrals recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {detail.referrals.recent.map((r) => (
                <div key={r.code} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{r.patient_name || "Unnamed"} <span className="font-mono text-xs text-slate-400">· {r.code}</span></p>
                    <p className="truncate text-xs text-slate-400">{r.tests}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "done" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>{r.status}</span>
                    <p className="mt-0.5 text-[10px] text-slate-500">{fmtDate(r.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FullViewModal>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setShowForm(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Add professional</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <input className={inputCls} placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
              <input className={inputCls} placeholder="Email (used to match referrals)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <input className={inputCls} placeholder="Specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
              </div>
              <input className={inputCls} placeholder="Hospital / clinic" value={hospital} onChange={(e) => setHospital(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <select className={inputCls} value={ctype} onChange={(e) => setCtype(e.target.value as "percent" | "flat")}>
                  <option value="percent">% of revenue</option>
                  <option value="flat">Flat ₦ / referral</option>
                </select>
                <input className={inputCls} placeholder={ctype === "percent" ? "e.g. 10" : "e.g. 2000"} value={cvalue} inputMode="decimal" onChange={(e) => setCvalue(e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
              <div className="pt-1">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Payout bank details (for settling commissions)</p>
                <input className={inputCls} placeholder="Bank name" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <input className={inputCls} placeholder="Account number" value={accountNumber} inputMode="numeric" onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d]/g, ""))} />
                  <input className={inputCls} placeholder="Account name" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-slate-500">Referrals are matched to this professional by email when a request they referred is marked seen.</p>
              <button onClick={create} disabled={!name.trim() || saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-2.5 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
