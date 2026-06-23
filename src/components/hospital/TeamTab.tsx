"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { UserPlus, Trash2, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ROLE_OPTIONS, ROLE_LABELS, type StaffRole } from "@/lib/emr/constants";
import type { EmrStaff } from "./emrTypes";

const emptyForm = { full_name: "", role: "nurse", email: "", phone: "", pin: "" };

export function TeamTab() {
  const [staff, setStaff] = useState<EmrStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital/emr/staff");
      const data = await res.json();
      if (res.ok) setStaff(data.staff);
      else toast.error(data.error ?? "Failed to load team.");
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addStaff() {
    if (!form.full_name.trim()) return toast.error("Name is required.");
    if (!form.email.trim() && !form.phone.trim()) return toast.error("Add an email or phone for sign-in.");
    if (form.pin && !/^\d{4}$/.test(form.pin)) return toast.error("PIN must be 4 digits.");
    setSaving(true);
    try {
      const res = await fetch("/api/hospital/emr/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed."); return; }
      toast.success(`${form.full_name} added.`);
      setForm({ ...emptyForm });
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function resetPin(s: EmrStaff) {
    const pin = window.prompt(`Set a new 4-digit PIN for ${s.full_name}:`);
    if (pin == null) return;
    if (!/^\d{4}$/.test(pin)) return toast.error("PIN must be 4 digits.");
    const res = await fetch("/api/hospital/emr/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, pin }),
    });
    if (res.ok) { toast.success("PIN updated."); await load(); }
    else toast.error("Failed to update PIN.");
  }

  async function toggleActive(s: EmrStaff) {
    const res = await fetch("/api/hospital/emr/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, is_active: !s.is_active }),
    });
    if (res.ok) await load();
  }

  async function remove(s: EmrStaff) {
    if (!window.confirm(`Remove ${s.full_name}?`)) return;
    const res = await fetch(`/api/hospital/emr/staff?id=${s.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Removed."); await load(); }
    else toast.error("Failed to remove.");
  }

  const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";

  return (
    <div className="space-y-4">
      {!showForm && (
        <Button onClick={() => setShowForm(true)} fullWidth size="sm">
          <UserPlus className="w-4 h-4" /> Add team member
        </Button>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <input className={inputCls} placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className={inputCls} placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <input className={inputCls} placeholder="4-digit login PIN (optional)" inputMode="numeric" maxLength={4} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} />
          <p className="text-[11px] text-slate-400">They sign in at <span className="font-mono">/emr-login</span> using their email/phone and this PIN.</p>
          <div className="flex gap-2">
            <Button onClick={addStaff} loading={saving} size="sm" fullWidth>Add</Button>
            <Button onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }} variant="ghost" size="sm">Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-16 bg-white rounded-2xl border border-slate-100" />)}</div>
      ) : staff.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No team members yet.</p>
      ) : (
        <div className="space-y-2">
          {staff.map((s) => (
            <div key={s.id} className={`bg-white rounded-2xl border shadow-sm p-3.5 flex items-center gap-3 ${s.is_active ? "border-slate-100" : "border-slate-100 opacity-60"}`}>
              <div className="w-9 h-9 rounded-full bg-medical-50 text-medical-600 flex items-center justify-center text-sm font-bold shrink-0">
                {s.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{s.full_name}</p>
                <p className="text-[11px] text-slate-400">
                  {ROLE_LABELS[s.role as StaffRole] ?? s.role}
                  {!s.has_pin && <span className="text-amber-500 font-medium"> · no PIN set</span>}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => resetPin(s)} title="Set PIN" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-medical-600"><KeyRound className="w-4 h-4" /></button>
                <button onClick={() => toggleActive(s)} title={s.is_active ? "Deactivate" : "Activate"} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-50">
                  {s.is_active ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <ShieldOff className="w-4 h-4" />}
                </button>
                <button onClick={() => remove(s)} title="Remove" className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
