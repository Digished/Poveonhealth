"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, X, Wallet, Users, BadgeCheck } from "lucide-react";
import toast from "react-hot-toast";
import { StatCard } from "@/components/lab/StatCard";

interface Professional {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  hospital: string | null;
  commission_type: string;
  commission_value: number;
  active: boolean;
  totals: { accrued: number; paid: number; count: number };
}

const naira = (n: number) => `₦${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function ProfessionalsView() {
  const [pros, setPros] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [hospital, setHospital] = useState("");
  const [ctype, setCtype] = useState<"percent" | "flat">("percent");
  const [cvalue, setCvalue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/professionals", { cache: "no-store" });
      const data = await res.json();
      setPros(data.professionals ?? []);
    } catch {
      toast.error("Failed to load professionals");
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Professional added");
      setShowForm(false);
      setName(""); setEmail(""); setPhone(""); setSpecialty(""); setHospital(""); setCvalue(""); setCtype("percent");
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

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Professionals" value={pros.length} accent="medical" icon={<Users className="h-4 w-4" />} />
        <StatCard label="Outstanding" value={naira(totalAccrued)} accent="amber" icon={<Wallet className="h-4 w-4" />} hint="Accrued, unpaid" />
        <StatCard label="Paid out" value={naira(totalPaid)} accent="emerald" icon={<BadgeCheck className="h-4 w-4" />} />
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700">
          <Plus className="h-4 w-4" /> Add professional
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>
      ) : pros.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-16 text-center text-slate-400">No professionals yet. Add referring doctors to track commissions.</div>
      ) : (
        <div className="space-y-3">
          {pros.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{p.name}{!p.active && <span className="ml-2 text-xs text-slate-500">(inactive)</span>}</p>
                  <p className="truncate text-xs text-slate-400">{[p.specialty, p.hospital, p.email].filter(Boolean).join(" · ") || "—"}</p>
                  <p className="mt-1 text-xs text-medical-300">{p.commission_type === "percent" ? `${p.commission_value}% of lab revenue` : `${naira(p.commission_value)} per referral`}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-400">Outstanding</p>
                  <p className="text-lg font-bold text-amber-300">{naira(p.totals.accrued)}</p>
                  <p className="text-[11px] text-slate-500">{naira(p.totals.paid)} paid · {p.totals.count} refs</p>
                </div>
              </div>
              {p.totals.accrued > 0 && (
                <button
                  onClick={() => payAll(p)}
                  disabled={paying === p.id}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {paying === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                  Mark {naira(p.totals.accrued)} paid
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
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
