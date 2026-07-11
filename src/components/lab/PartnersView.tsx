"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X, Check, Building2, HeartHandshake, Pencil, Phone, Mail, MapPin } from "lucide-react";
import toast from "react-hot-toast";

interface Partner {
  id: string;
  type: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

const TYPE_META: Record<string, { label: string; cls: string }> = {
  hmo: { label: "HMO", cls: "bg-violet-500/15 text-violet-300" },
  hospital: { label: "Hospital", cls: "bg-sky-500/15 text-sky-300" },
  company: { label: "Company", cls: "bg-amber-500/15 text-amber-300" },
};

const EMPTY_FORM = { type: "hmo", name: "", contact_name: "", phone: "", email: "", address: "", notes: "" };

/**
 * Partners — the HMOs, hospitals and companies a lab works with. Managed by
 * the lab itself, in both Lite and LIMS modes.
 */
export function PartnersView({ canManage }: { canManage: boolean }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeF, setTypeF] = useState<"" | "hmo" | "hospital" | "company">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lab/partners", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed");
      setPartners(data.partners ?? []);
    } catch {
      toast.error("Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setFormOpen(true);
  }

  function openEdit(p: Partner) {
    setEditing(p);
    setForm({
      type: p.type,
      name: p.name,
      contact_name: p.contact_name ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      address: p.address ?? "",
      notes: p.notes ?? "",
    });
    setFormOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { toast.error("The partner's name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/lab/partners/${editing.id}` : "/api/lab/partners", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save");
      toast.success(editing ? "Partner updated" : "Partner added");
      setFormOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Partner) {
    if (!window.confirm(`Remove ${p.name} from your partners?`)) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/lab/partners/${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to remove");
      setPartners((prev) => prev.filter((x) => x.id !== p.id));
      toast.success("Partner removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusyId(null);
    }
  }

  const shown = useMemo(() => partners.filter((p) => !typeF || p.type === typeF), [partners, typeF]);
  const counts = useMemo(() => ({
    hmo: partners.filter((p) => p.type === "hmo").length,
    hospital: partners.filter((p) => p.type === "hospital").length,
    company: partners.filter((p) => p.type === "company").length,
  }), [partners]);

  const inputCls = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-medical-400 focus:outline-none";
  const labelCls = "mb-1 block text-xs font-medium text-slate-400";

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-medical-400" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Partners</h2>
          <p className="mt-1 text-sm text-slate-400">The HMOs, hospitals and companies your lab is partnered with.</p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-medical-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-medical-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add partner
          </button>
        )}
      </div>

      {/* Type filter */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-white/5 p-1">
        {([["", `All (${partners.length})`], ["hmo", `HMOs (${counts.hmo})`], ["hospital", `Hospitals (${counts.hospital})`], ["company", `Companies (${counts.company})`]] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTypeF(v)}
            className={`shrink-0 flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-semibold transition ${typeF === v ? "bg-medical-600 text-white shadow-sm" : "text-slate-400 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 py-14 text-center">
          <HeartHandshake className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <p className="text-sm font-medium text-slate-300">No partners yet</p>
          <p className="mt-1 text-xs text-slate-500">Add the HMOs and hospitals you work with — they help your team route billing and referrals correctly.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.map((p) => {
            const meta = TYPE_META[p.type] ?? TYPE_META.company;
            return (
              <div key={p.id} className={`rounded-2xl border p-4 ${p.is_active ? "border-white/10 bg-white/5" : "border-white/5 bg-white/3 opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
                      {!p.is_active && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-400">inactive</span>}
                    </div>
                    {p.contact_name && <p className="mt-0.5 text-xs text-slate-400">Contact: {p.contact_name}</p>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => remove(p)} disabled={busyId === p.id} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50" title="Remove">
                        {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-400">
                  {p.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /> <a href={`tel:${p.phone}`} className="hover:text-white">{p.phone}</a></p>}
                  {p.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 shrink-0" /> <a href={`mailto:${p.email}`} className="hover:text-white">{p.email}</a></p>}
                  {p.address && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" /> {p.address}</p>}
                  {p.notes && <p className="mt-1.5 text-slate-500">{p.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={() => setFormOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{editing ? "Edit partner" : "Add partner"}</h3>
              <button onClick={() => setFormOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Type *</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["hmo", "hospital", "company"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${form.type === t ? "border-medical-400 bg-medical-600/25 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
                    >
                      {TYPE_META[t].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Name *</label>
                <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={form.type === "hmo" ? "e.g. Hygeia HMO" : form.type === "hospital" ? "e.g. St. Mary's Hospital" : "e.g. Acme Ltd"} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Contact person</label>
                  <input className={inputCls} value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} placeholder="Optional" />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input className={inputCls} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} inputMode="tel" placeholder="Optional" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} inputMode="email" placeholder="Optional" />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input className={inputCls} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Optional" />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. billing terms, tariff plan, account manager" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setFormOpen(false)} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white hover:bg-medical-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {editing ? "Save changes" : "Add partner"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
