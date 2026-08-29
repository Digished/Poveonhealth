"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  BadgeCheck, ImagePlus, Loader2, Mail, MapPin, Pill, Plus, Power, RefreshCw,
  Save, TicketPercent, Trash2, Users, X,
} from "lucide-react";
import { STATE_NAMES, lgasForState } from "@/lib/nigeria-locations";
import { FuzzyCombo } from "@/components/ui/FuzzyCombo";

type Pharmacy = {
  id: string; name: string; slug: string; code: string; email: string; logo_url: string | null;
  phone: string | null; address: string | null; city: string | null; state: string | null;
  discount_percent: number; active: boolean; onboarded_at: string | null; created_at: string;
  customers: number; redemptions: number; discount_given: number;
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function AdminPharmaciesTab() {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pharmacies", { cache: "no-store" });
      const d = await res.json();
      if (d.success) setPharmacies(d.pharmacies);
    } catch {
      toast.error("Failed to load pharmacies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function patch(id: string, body: Record<string, unknown>, okMessage: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/pharmacies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "That didn't work."); return; }
      toast.success(okMessage);
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(p: Pharmacy) {
    if (!window.confirm(`Remove ${p.name}? Pharmacies that have traded are deactivated, not deleted.`)) return;
    setBusyId(p.id);
    try {
      const res = await fetch(`/api/admin/pharmacies/${p.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not remove."); return; }
      toast.success(d.deactivated ? "Pharmacy deactivated" : "Pharmacy removed");
      load();
    } finally {
      setBusyId(null);
    }
  }

  const totals = pharmacies.reduce(
    (acc, p) => ({
      customers: acc.customers + p.customers,
      redemptions: acc.redemptions + p.redemptions,
      discount: acc.discount + p.discount_given,
    }),
    { customers: 0, redemptions: 0, discount: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Pill className="h-5 w-5" /> Pharmacies
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Partner pharmacies honour care-plan codes and track their own regulars.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-lg bg-medical-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-medical-700"
          >
            <Plus className="h-4 w-4" /> Add pharmacy
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SmallStat label="Pharmacies" value={String(pharmacies.length)} icon={<Pill className="h-4 w-4" />} />
        <SmallStat label="Active" value={String(pharmacies.filter((p) => p.active).length)} icon={<BadgeCheck className="h-4 w-4" />} />
        <SmallStat label="Customers tracked" value={String(totals.customers)} icon={<Users className="h-4 w-4" />} />
        <SmallStat label="Discount given" value={naira(totals.discount)} icon={<TicketPercent className="h-4 w-4" />} />
      </div>

      {adding && <AddPharmacyForm onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-semibold">Pharmacy</th>
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Discount</th>
                <th className="px-4 py-2.5 font-semibold">Customers</th>
                <th className="px-4 py-2.5 font-semibold">Discount given</th>
                <th className="px-4 py-2.5 font-semibold">Signed in</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {pharmacies.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No partner pharmacies yet. Add one to start the network.
                  </td>
                </tr>
              )}
              {pharmacies.map((p) => (
                <tr key={p.id} className={`transition hover:bg-white/5 ${p.active ? "" : "opacity-50"}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {p.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.logo_url} alt={p.name} className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                          <Pill className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-white">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.email}</p>
                        <p className="text-xs text-slate-500">
                          {[p.city, p.state].filter(Boolean).join(", ") || "No location set"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-300">{p.code}</td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={String(p.discount_percent)}
                      onBlur={(e) => {
                        const v = Number(e.target.value.replace(/[^\d]/g, ""));
                        if (v !== p.discount_percent) patch(p.id, { discount_percent: v }, "Discount updated");
                      }}
                      className="w-16 rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white focus:border-medical-500 focus:outline-none"
                    />
                    <span className="ml-1 text-xs text-slate-500">%</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">{p.customers}</td>
                  <td className="px-4 py-3 text-xs text-emerald-300">{naira(p.discount_given)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {p.onboarded_at ? formatDate(p.onboarded_at) : <span className="text-amber-400">Not yet</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <IconAction
                        title="Re-send the invite email"
                        busy={busyId === p.id}
                        onClick={() => patch(p.id, { resend_invite: true }, "Invite sent")}
                        icon={<Mail className="h-3.5 w-3.5" />}
                      />
                      <IconAction
                        title={p.active ? "Deactivate" : "Reactivate"}
                        busy={busyId === p.id}
                        onClick={() => patch(p.id, { active: !p.active }, p.active ? "Deactivated" : "Reactivated")}
                        icon={<Power className="h-3.5 w-3.5" />}
                      />
                      <IconAction
                        title="Remove"
                        danger
                        busy={busyId === p.id}
                        onClick={() => remove(p)}
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SmallStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300">{icon}</div>
      <p className="mt-2.5 truncate text-xl font-extrabold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function IconAction({
  title, icon, onClick, busy, danger,
}: {
  title: string; icon: React.ReactNode; onClick: () => void; busy?: boolean; danger?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg p-2 transition disabled:opacity-40 ${
        danger ? "text-red-400 hover:bg-red-500/15" : "text-slate-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
    </button>
  );
}

function AddPharmacyForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", city: "", state: "", discount_percent: "",
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickLogo(file: File) {
    setLogo(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function save() {
    // State is required — the patient directory filters on it.
    if (saving || form.name.trim().length < 2 || !form.email.includes("@") || !form.state) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/pharmacies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          discount_percent: form.discount_percent ? Number(form.discount_percent) : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Could not add that pharmacy."); return; }

      // The logo needs the new pharmacy's id, so it goes up straight after.
      if (logo) {
        const fd = new FormData();
        fd.append("logo", logo);
        const up = await fetch(`/api/admin/pharmacies/${d.pharmacy.id}/logo`, { method: "POST", body: fd });
        if (!up.ok) toast.error("Pharmacy added, but the logo didn't upload — add it from the list.");
      }

      toast.success(`Added — code ${d.pharmacy.code}. Invite emailed.`);
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof form, placeholder: string, type = "text") => (
    <input
      type={type}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      placeholder={placeholder}
      className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-medical-500 focus:outline-none"
    />
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Add a partner pharmacy</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        They&apos;ll get an email with their pharmacy code and a link to sign in. Their logo and location
        are what members see in the pharmacy directory.
      </p>

      {/* Logo */}
      <div className="mt-4 flex items-center gap-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLogo(f); }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition hover:border-medical-500"
        >
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-slate-500" />
          )}
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-200">Pharmacy logo</p>
          <p className="text-xs text-slate-400">JPEG, PNG, WebP or GIF, under 5MB. Optional.</p>
          {logo && (
            <button
              onClick={() => { setLogo(null); setLogoPreview(null); }}
              className="mt-1 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {field("name", "Pharmacy name")}
        {field("email", "Email address", "email")}
        {field("phone", "Phone (optional)")}
      </div>

      {/* Location — picked from the list, so the patient filter can rely on it */}
      <div className="mt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-300">
          <MapPin className="h-3.5 w-3.5 text-slate-500" /> Location *
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="admin-combo">
            <FuzzyCombo
              value={form.state}
              onChange={(v) => setForm({ ...form, state: v, city: "" })}
              options={STATE_NAMES}
              placeholder="State *"
            />
          </div>
          <div className="admin-combo">
            <FuzzyCombo
              value={form.city}
              onChange={(v) => setForm({ ...form, city: v })}
              options={lgasForState(form.state)}
              placeholder={form.state ? "Local government" : "Pick a state first"}
              disabled={!form.state}
              allowCustom
            />
          </div>
          {field("address", "Street address (optional)")}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {field("discount_percent", "Discount % (default applies)")}
      </div>

      <button
        onClick={save}
        disabled={saving || form.name.trim().length < 2 || !form.email.includes("@") || !form.state}
        className="mt-4 flex items-center gap-2 rounded-lg bg-medical-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "Adding…" : "Add & invite"}
      </button>
      {!form.state && (
        <p className="mt-2 text-xs text-amber-400">Pick a state — members filter the directory by it.</p>
      )}
    </div>
  );
}
