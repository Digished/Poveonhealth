"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  Gift, Truck, Plus, Trash2, RefreshCw, Check, X, MapPin,
  Building2, Users, Package, DollarSign, ToggleLeft, ToggleRight,
} from "lucide-react";

interface LabLite { id: string; name: string }
interface Perk {
  id: string; doctor_email: string; lab_id: string; lab_name: string;
  type: string; remaining_uses: number; total_uses: number; is_active: boolean;
  note: string | null; created_at: string;
}
interface PartnerLab { lab_id: string; lab_name: string }
interface Partner {
  id: string; name: string; email: string; contact_name: string | null;
  phone: string | null; address: string | null; is_active: boolean;
  labs: PartnerLab[]; rider_count: number;
}
interface Ride {
  id: string; code: string; doctor_email: string; destination_lab: string;
  patient_name: string; patient_phone: string; pickup_address: string;
  status: string; cost: number | null; is_paid_to_partner: boolean;
  partner_name: string | null; rider_name: string | null;
  redeem_by: string; created_at: string; completed_at: string | null;
}
interface RideSummary {
  total: number; pending: number; assigned: number; completed: number;
  total_cost: number; unpaid_cost: number;
}

type SubTab = "perks" | "partners" | "rides";

const naira = (n: number) => `₦${n.toLocaleString()}`;
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  assigned: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export function AdminPerksTab() {
  const [subTab, setSubTab] = useState<SubTab>("perks");
  const [labs, setLabs] = useState<LabLite[]>([]);
  const [perks, setPerks] = useState<Perk[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [rideSummary, setRideSummary] = useState<RideSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [labsRes, perksRes, partnersRes, ridesRes] = await Promise.all([
        fetch("/api/admin/labs"),
        fetch("/api/admin/perks"),
        fetch("/api/admin/logistics"),
        fetch("/api/admin/rides"),
      ]);
      if (labsRes.ok) { const d = await labsRes.json(); setLabs((d.labs ?? []).map((l: LabLite) => ({ id: l.id, name: l.name }))); }
      if (perksRes.ok) { const d = await perksRes.json(); setPerks(d.perks ?? []); }
      if (partnersRes.ok) { const d = await partnersRes.json(); setPartners(d.partners ?? []); }
      if (ridesRes.ok) { const d = await ridesRes.json(); setRides(d.rides ?? []); setRideSummary(d.summary ?? null); }
    } catch { toast.error("Failed to load."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><Gift className="w-5 h-5" /> Perks &amp; Rides</h2>
          <p className="text-xs text-slate-400 mt-0.5">Assign doctor perks, manage logistics partners, and track free rides.</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-white/10 px-3 py-2 rounded-lg">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {([["perks", "Doctor Perks", Gift], ["partners", "Logistics Partners", Truck], ["rides", "Rides", Package]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setSubTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition ${subTab === key ? "bg-medical-600 text-white" : "bg-white/10 text-slate-300 hover:bg-white/15"}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {subTab === "perks" && <PerksSection labs={labs} perks={perks} reload={loadAll} />}
      {subTab === "partners" && <PartnersSection labs={labs} partners={partners} reload={loadAll} />}
      {subTab === "rides" && <RidesSection rides={rides} summary={rideSummary} reload={loadAll} />}
    </div>
  );
}

// ── Doctor perks ────────────────────────────────────────────────────────────
function PerksSection({ labs, perks, reload }: { labs: LabLite[]; perks: Perk[]; reload: () => void }) {
  const [email, setEmail] = useState("");
  const [labId, setLabId] = useState("");
  const [uses, setUses] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function assign() {
    if (!email.trim() || !labId) { toast.error("Doctor email and lab are required."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/perks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctor_email: email.trim(), lab_id: labId, uses: Number(uses) || 1, note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to assign perk."); return; }
      toast.success("Perk assigned.");
      setEmail(""); setNote(""); setUses("1");
      reload();
    } catch { toast.error("Network error."); } finally { setSaving(false); }
  }

  async function toggle(p: Perk) {
    const res = await fetch(`/api/admin/perks/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    if (res.ok) { reload(); } else { toast.error("Failed to update."); }
  }
  async function remove(p: Perk) {
    if (!confirm(`Delete this free-ride perk for ${p.doctor_email}?`)) return;
    const res = await fetch(`/api/admin/perks/${p.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted."); reload(); } else { toast.error("Failed to delete."); }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400";

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <p className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> Assign a free-ride perk</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input placeholder="Doctor email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          <select value={labId} onChange={(e) => setLabId(e.target.value)} className={inputCls}>
            <option value="">Select lab…</option>
            {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="number" min={1} placeholder="Number of rides" value={uses} onChange={(e) => setUses(e.target.value)} className={inputCls} />
          <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </div>
        <button onClick={assign} disabled={saving}
          className="mt-3 flex items-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Assign perk
        </button>
      </div>

      <div className="space-y-2">
        {perks.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No perks assigned yet.</p>}
        {perks.map((p) => (
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${p.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}`}>
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{p.doctor_email}</p>
              <p className="text-xs text-slate-400 truncate">
                {p.lab_name} · Free ride · {p.remaining_uses}/{p.total_uses} left{p.note ? ` · ${p.note}` : ""}
              </p>
            </div>
            <button onClick={() => toggle(p)} title={p.is_active ? "Deactivate" : "Activate"} className="text-slate-300 hover:text-white shrink-0">
              {p.is_active ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6" />}
            </button>
            <button onClick={() => remove(p)} className="text-slate-400 hover:text-red-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Logistics partners ──────────────────────────────────────────────────────
function PartnersSection({ labs, partners, reload }: { labs: LabLite[]; partners: Partner[]; reload: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [labIds, setLabIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400";

  async function create() {
    if (!name.trim() || !email.trim()) { toast.error("Name and email are required."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/logistics", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), contact_name: contact.trim(), phone: phone.trim(), lab_ids: labIds }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to add partner."); return; }
      toast.success("Partner added.");
      setName(""); setEmail(""); setContact(""); setPhone(""); setLabIds([]); setShowAdd(false);
      reload();
    } catch { toast.error("Network error."); } finally { setSaving(false); }
  }

  async function toggleLab(p: Partner, lab: LabLite) {
    const current = new Set(p.labs.map((l) => l.lab_id));
    if (current.has(lab.id)) current.delete(lab.id); else current.add(lab.id);
    const res = await fetch(`/api/admin/logistics/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lab_ids: Array.from(current) }),
    });
    if (res.ok) reload(); else toast.error("Failed to update labs.");
  }
  async function toggleActive(p: Partner) {
    const res = await fetch(`/api/admin/logistics/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !p.is_active }),
    });
    if (res.ok) reload(); else toast.error("Failed to update.");
  }
  async function remove(p: Partner) {
    if (!confirm(`Delete ${p.name} and all its riders?`)) return;
    const res = await fetch(`/api/admin/logistics/${p.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted."); reload(); } else toast.error("Failed to delete.");
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setShowAdd((v) => !v)}
        className="flex items-center gap-2 bg-medical-600 hover:bg-medical-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
        <Plus className="w-4 h-4" /> Add logistics partner
      </button>

      {showAdd && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            <input placeholder="Login email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            <input placeholder="Contact person (optional)" value={contact} onChange={(e) => setContact(e.target.value)} className={inputCls} />
            <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-2">Assign labs</p>
            <div className="flex flex-wrap gap-2">
              {labs.map((l) => {
                const on = labIds.includes(l.id);
                return (
                  <button key={l.id} type="button"
                    onClick={() => setLabIds((prev) => on ? prev.filter((x) => x !== l.id) : [...prev, l.id])}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition ${on ? "bg-medical-500 border-medical-400 text-white" : "bg-slate-800 border-slate-600 text-slate-300"}`}>
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={create} disabled={saving} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-lg">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg bg-white/10 text-slate-300 text-sm font-semibold">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {partners.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No logistics partners yet.</p>}
        {partners.map((p) => (
          <div key={p.id} className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${p.is_active ? "bg-medical-500/20 text-medical-300" : "bg-slate-500/20 text-slate-400"}`}>
                <Truck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                <p className="text-xs text-slate-400 truncate">{p.email}{p.phone ? ` · ${p.phone}` : ""} · <Users className="w-3 h-3 inline" /> {p.rider_count} rider{p.rider_count === 1 ? "" : "s"}</p>
              </div>
              <button onClick={() => toggleActive(p)} title={p.is_active ? "Deactivate" : "Activate"} className="text-slate-300 hover:text-white shrink-0">
                {p.is_active ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6" />}
              </button>
              <button onClick={() => remove(p)} className="text-slate-400 hover:text-red-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> Assigned labs</p>
              <div className="flex flex-wrap gap-1.5">
                {labs.map((l) => {
                  const on = p.labs.some((pl) => pl.lab_id === l.id);
                  return (
                    <button key={l.id} onClick={() => toggleLab(p, l)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${on ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300" : "bg-slate-800 border-slate-600 text-slate-400 hover:text-slate-200"}`}>
                      {on ? <Check className="w-3 h-3 inline mr-0.5" /> : null}{l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rides tracking ──────────────────────────────────────────────────────────
function RidesSection({ rides, summary, reload }: { rides: Ride[]; summary: RideSummary | null; reload: () => void }) {
  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/rides/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) reload(); else toast.error("Failed to update.");
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total rides" value={String(summary.total)} />
          <Stat label="Pending" value={String(summary.pending)} />
          <Stat label="Completed" value={String(summary.completed)} />
          <Stat label="Unpaid cost" value={naira(summary.unpaid_cost)} accent />
        </div>
      )}

      <div className="space-y-2">
        {rides.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No rides yet.</p>}
        {rides.map((r) => <RideRow key={r.id} ride={r} onPatch={patch} />)}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-3 border ${accent ? "bg-amber-500/10 border-amber-400/30" : "bg-white/5 border-white/10"}`}>
      <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold ${accent ? "text-amber-300" : "text-white"}`}>{value}</p>
    </div>
  );
}

function RideRow({ ride, onPatch }: { ride: Ride; onPatch: (id: string, body: Record<string, unknown>) => void }) {
  const [cost, setCost] = useState(ride.cost != null ? String(ride.cost) : "");
  const inputCls = "w-24 px-2 py-1 rounded-lg border border-slate-600 bg-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-medical-400";

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{ride.patient_name} <span className="text-slate-500 font-mono text-xs">· {ride.code}</span></p>
          <p className="text-xs text-slate-400 truncate flex items-center gap-1"><MapPin className="w-3 h-3" /> {ride.pickup_address} → {ride.destination_lab}</p>
          <p className="text-[11px] text-slate-500 truncate mt-0.5">
            Dr {ride.doctor_email}{ride.partner_name ? ` · ${ride.partner_name}` : " · no partner"}{ride.rider_name ? ` · ${ride.rider_name}` : ""}
          </p>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[ride.status] ?? STATUS_STYLES.pending}`}>{ride.status}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-400">Cost ₦</span>
          <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className={inputCls} placeholder="0" />
          <button onClick={() => onPatch(ride.id, { cost: cost === "" ? null : Number(cost) })}
            className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded-lg">Save</button>
        </div>
        <button onClick={() => onPatch(ride.id, { is_paid_to_partner: !ride.is_paid_to_partner })}
          className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 ${ride.is_paid_to_partner ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}>
          {ride.is_paid_to_partner ? <><Check className="w-3.5 h-3.5" /> Paid</> : "Mark paid to partner"}
        </button>
      </div>
    </div>
  );
}
