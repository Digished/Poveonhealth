"use client";

import { useState, useRef } from "react";
import { toast } from "react-hot-toast";
import {
  X,
  Check,
  Upload,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Building2,
  Phone,
  Image as ImageIcon,
  Bell,
  Layers,
  Pencil,
  Sparkles,
} from "lucide-react";
import { parsePhones } from "@/lib/phones";
import { SERVICE_CATEGORIES, LAB_CERTIFICATIONS } from "@/lib/constants";
import type { Lab, PhoneEntry } from "@/lib/types";

// ── Shared constants ──────────────────────────────────────────────────────────

const COUNTRY_CODES = [
  { code: "+234", label: "🇳🇬 Nigeria (+234)" },
  { code: "+1",   label: "🇺🇸 US/Canada (+1)" },
  { code: "+44",  label: "🇬🇧 UK (+44)" },
  { code: "+27",  label: "🇿🇦 South Africa (+27)" },
  { code: "+233", label: "🇬🇭 Ghana (+233)" },
  { code: "+254", label: "🇰🇪 Kenya (+254)" },
  { code: "+256", label: "🇺🇬 Uganda (+256)" },
  { code: "+255", label: "🇹🇿 Tanzania (+255)" },
  { code: "+251", label: "🇪🇹 Ethiopia (+251)" },
  { code: "+212", label: "🇲🇦 Morocco (+212)" },
  { code: "+20",  label: "🇪🇬 Egypt (+20)" },
  { code: "+971", label: "🇦🇪 UAE (+971)" },
  { code: "+91",  label: "🇮🇳 India (+91)" },
  { code: "+86",  label: "🇨🇳 China (+86)" },
  { code: "",     label: "N/A (No country code)" },
];

function parseDialCode(full: string): { dial: string; local: string } {
  // Check for empty string first (N/A option)
  if (!full.startsWith("+")) {
    return { dial: "", local: full };
  }
  // Check country codes
  for (const c of COUNTRY_CODES) {
    if (c.code && full.startsWith(c.code)) {
      return { dial: c.code, local: full.slice(c.code.length).trimStart() };
    }
  }
  return {
    dial: "+234",
    local: full.startsWith("+") ? full.replace(/^\+\d{1,4}/, "").trimStart() : full,
  };
}

const INPUT =
  "w-full rounded-xl border border-slate-600 bg-slate-800 text-white placeholder-slate-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 transition-colors";
const LABEL = "text-sm font-semibold text-slate-200 block mb-1.5";
const HINT = "text-xs text-slate-500 mt-1.5 leading-relaxed";

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { label: "Basic Info",    icon: Building2 },
  { label: "Contact",       icon: Phone },
  { label: "Services",      icon: Layers },
  { label: "Branding",      icon: ImageIcon },
  { label: "Notifications", icon: Bell },
];

// ── PhoneInput ────────────────────────────────────────────────────────────────

function PhoneInput({
  entry,
  onChange,
  onRemove,
  showRemove,
}: {
  entry: PhoneEntry;
  onChange: (v: PhoneEntry) => void;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const { dial, local } = parseDialCode(entry.number);
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 space-y-2">
      <div className="flex gap-2">
        <select
          value={dial}
          onChange={(e) => onChange({ ...entry, number: e.target.value + " " + local })}
          className="shrink-0 rounded-xl border border-slate-600 bg-slate-800 text-white text-sm px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-medical-400"
          style={{ minWidth: "10rem" }}
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <input
          type="tel"
          value={local}
          onChange={(e) => onChange({ ...entry, number: dial + " " + e.target.value })}
          placeholder="800 000 0000"
          className="flex-1 min-w-0 rounded-xl border border-slate-600 bg-slate-800 text-white placeholder-slate-400 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400"
        />
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-2.5 rounded-xl bg-red-900/30 text-red-400 hover:bg-red-800/40 transition-colors shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <input
        type="text"
        value={entry.label}
        onChange={(e) => onChange({ ...entry, label: e.target.value })}
        placeholder="Label (optional) — e.g. Front Desk, Emergency Line"
        className="w-full rounded-xl border border-slate-700 bg-slate-900/60 text-white placeholder-slate-500 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-medical-400"
      />
    </div>
  );
}

// ── WhatsAppInput ─────────────────────────────────────────────────────────────

function WhatsAppInput({
  value,
  onChange,
  onRemove,
  showRemove,
}: {
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  showRemove: boolean;
}) {
  const { dial, local } = parseDialCode(value);
  return (
    <div className="flex gap-2">
      <select
        value={dial}
        onChange={(e) => onChange(e.target.value + " " + local)}
        className="shrink-0 rounded-xl border border-slate-600 bg-slate-800 text-white text-sm px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-medical-400"
        style={{ minWidth: "10rem" }}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      <input
        type="tel"
        value={local}
        onChange={(e) => onChange(dial + " " + e.target.value)}
        placeholder="800 000 0000"
        className="flex-1 min-w-0 rounded-xl border border-slate-600 bg-slate-800 text-white placeholder-slate-400 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400"
      />
      {showRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-2.5 rounded-xl bg-red-900/30 text-red-400 hover:bg-red-800/40 transition-colors shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── SearchableCheckboxGroup ───────────────────────────────────────────────────

function SearchableCheckboxGroup({
  label,
  groups,
  flatItems,
  selected,
  onChange,
}: {
  label: string;
  groups?: { group: string; items: string[] }[];
  flatItems?: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase().trim();

  function toggle(item: string) {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  }

  type Row = { type: "group"; name: string } | { type: "item"; name: string };
  const rows: Row[] = [];

  if (groups) {
    for (const g of groups) {
      const filtered = q
        ? g.items.filter((i) => i.toLowerCase().includes(q))
        : g.items;
      if (filtered.length === 0) continue;
      if (!q) rows.push({ type: "group", name: g.group });
      for (const item of filtered) rows.push({ type: "item", name: item });
    }
  } else if (flatItems) {
    const filtered = q
      ? flatItems.filter((i) => i.toLowerCase().includes(q))
      : flatItems;
    for (const item of filtered) rows.push({ type: "item", name: item });
  }

  return (
    <div>
      <label className={LABEL}>{label}</label>

      <div className="relative mb-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          className="w-full rounded-xl border border-slate-600 bg-slate-800 text-white placeholder-slate-400 pl-4 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400"
        />
      </div>

      <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/60 divide-y divide-slate-800/60">
        {rows.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-4">No results</p>
        )}
        {rows.map((row, idx) => {
          if (row.type === "group") {
            return (
              <div key={`group-${idx}`} className="px-3 py-1.5 bg-slate-800/60">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {row.name}
                </p>
              </div>
            );
          }
          const checked = selected.includes(row.name);
          return (
            <label
              key={`item-${row.name}`}
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-800/40 transition-colors"
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                  checked
                    ? "bg-medical-600 border-medical-600"
                    : "bg-slate-800 border-slate-600"
                }`}
                onClick={() => toggle(row.name)}
              >
                {checked && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span
                className="text-sm text-slate-200 flex-1"
                onClick={() => toggle(row.name)}
              >
                {row.name}
              </span>
            </label>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-medical-600/20 border border-medical-600/40 text-medical-300 text-xs font-medium"
            >
              {s}
              <button
                type="button"
                onClick={() => toggle(s)}
                className="ml-0.5 text-medical-400 hover:text-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ImageUploadCard ───────────────────────────────────────────────────────────

function ImageUploadCard({
  label,
  hint,
  currentUrl,
  uploading,
  onFileSelect,
  onRemove,
  showRemove,
}: {
  label: string;
  hint: string;
  currentUrl: string | null;
  uploading: boolean;
  onFileSelect: (f: File) => void;
  onRemove?: () => void;
  showRemove?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div>
      <p className={LABEL}>{label}</p>
      {currentUrl && (
        <div className="mb-2 rounded-xl overflow-hidden border border-slate-700 relative">
          <img src={currentUrl} alt={label} className="w-full h-28 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <span className="absolute bottom-2 left-3 text-xs text-white font-semibold flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-emerald-400" /> Uploaded
          </span>
        </div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelect(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {uploading ? "Uploading…" : currentUrl ? "Replace" : "Upload"}
        </button>
        {showRemove && currentUrl && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-800/60 bg-red-900/20 hover:bg-red-900/30 text-red-400 text-sm font-medium transition-colors disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" />
            Remove
          </button>
        )}
      </div>
      <p className={HINT}>{hint}</p>
    </div>
  );
}

// ── Parse whatsapp field from stored JSON string ──────────────────────────────

function parseWhatsapp(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

// ── Main component ────────────────────────────────────────────────────────────

export function EditLabForm({
  lab,
  onClose,
  onSuccess,
}: {
  lab: Lab;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(1);

  // ── Step 1: Basic Info ────────────────────────────────────────────────────
  const [name, setName] = useState(lab.name ?? "");
  const [address, setAddress] = useState(lab.address ?? "");
  const [description, setDescription] = useState(lab.description ?? "");

  // ── Step 2: Contact ───────────────────────────────────────────────────────
  const [phones, setPhones] = useState<PhoneEntry[]>(() => {
    const parsed = parsePhones(lab.phones);
    return parsed.length > 0 ? parsed : [{ number: "+234 ", label: "" }];
  });
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>(() => {
    const parsed = parseWhatsapp(lab.whatsapp);
    return parsed.length > 0 ? parsed : ["+234 "];
  });

  // ── Step 3: Services & Certifications ────────────────────────────────────
  const [serviceCategories, setServiceCategories] = useState<string[]>(
    lab.service_categories ?? []
  );
  const [certifications, setCertifications] = useState<string[]>(
    lab.certifications ?? []
  );

  // ── Step 4: Branding ──────────────────────────────────────────────────────
  const [logoUrl, setLogoUrl] = useState<string | null>(lab.logo_url ?? null);
  const [heroUrl, setHeroUrl] = useState<string | null>(lab.hero_image_url ?? null);
  const [slug, setSlug] = useState(lab.slug ?? "");
  const [slugError, setSlugError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [removingHero, setRemovingHero] = useState(false);

  // ── Step 5: Notifications ─────────────────────────────────────────────────
  const [notificationEmail, setNotificationEmail] = useState(
    lab.notification_email ?? ""
  );
  const [requestEmails, setRequestEmails] = useState<string[]>(() => {
    const list: string[] = [];
    if (lab.request_email) list.push(lab.request_email);
    if (Array.isArray(lab.request_emails)) {
      for (const e of lab.request_emails) {
        if (
          typeof e === "string" &&
          e.trim() &&
          !list.some((x) => x.toLowerCase() === e.trim().toLowerCase())
        ) {
          list.push(e.trim());
        }
      }
    }
    return list.length ? list : [""];
  });

  // ── Submit state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);

  // ── Validation per step ───────────────────────────────────────────────────
  const stepValid = (() => {
    if (step === 1) return !!name.trim() && !!address.trim();
    if (step === 4 && slug.trim()) return /^[a-z0-9-]+$/.test(slug.trim());
    return true;
  })();

  // ── Navigation ────────────────────────────────────────────────────────────
  function handleNext() {
    if (step === 4 && slug.trim() && !/^[a-z0-9-]+$/.test(slug.trim())) {
      setSlugError("Only lowercase letters, numbers, and hyphens allowed");
      return;
    }
    setSlugError("");
    setStep((s) => s + 1);
  }

  function handleBack() {
    if (step === 1) {
      onClose();
    } else {
      setStep((s) => s - 1);
    }
  }

  // ── Image upload helpers ──────────────────────────────────────────────────
  async function handleUploadLogo(file: File) {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/admin/labs/${lab.id}/logo`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setLogoUrl(data.logo_url);
        toast.success("Logo uploaded!");
      } else {
        toast.error(data.error ?? "Logo upload failed");
      }
    } catch {
      toast.error("Network error uploading logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleUploadHero(file: File) {
    setUploadingHero(true);
    try {
      const fd = new FormData();
      fd.append("hero", file);
      const res = await fetch(`/api/admin/labs/${lab.id}/hero`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setHeroUrl(data.hero_image_url);
        toast.success("Hero image uploaded!");
      } else {
        toast.error(data.error ?? "Hero upload failed");
      }
    } catch {
      toast.error("Network error uploading hero image");
    } finally {
      setUploadingHero(false);
    }
  }

  async function handleRemoveHero() {
    setRemovingHero(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}/hero`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setHeroUrl(null);
        toast.success("Hero image removed");
      } else {
        toast.error(data.error ?? "Failed to remove hero image");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRemovingHero(false);
    }
  }

  // ── Save / PATCH ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim() || !address.trim()) {
      toast.error("Name and address are required");
      setStep(1);
      return;
    }
    if (slug.trim() && !/^[a-z0-9-]+$/.test(slug.trim())) {
      setSlugError("Only lowercase letters, numbers, and hyphens allowed");
      setStep(4);
      return;
    }

    const cleanedPhones = phones
      .map((p) => ({ number: p.number.trim(), label: p.label.trim() }))
      .filter((p) => p.number.replace(/\D/g, "").length >= 7);

    const cleanedWhatsapp = whatsappNumbers
      .map((n) => n.trim())
      .filter((n) => n.replace(/\D/g, "").length >= 7);

    const body: Record<string, unknown> = {
      name: name.trim(),
      address: address.trim(),
      description: description.trim(),
      phones: cleanedPhones,
      notification_email: notificationEmail.trim() || null,
      slug: slug.trim() || null,
      whatsapp: cleanedWhatsapp.length ? JSON.stringify(cleanedWhatsapp) : null,
      request_emails: requestEmails.map((e) => e.trim()).filter(Boolean),
      service_categories: serviceCategories,
      certifications: certifications,
    };

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/labs/${lab.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        toast.success("Lab updated successfully!");
        onSuccess();
      } else {
        toast.error(data.error ?? "Failed to update lab");
      }
    } catch {
      toast.error("Network error saving changes");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden">

      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-medical-600/20 flex items-center justify-center">
            <Pencil className="w-4 h-4 text-medical-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Edit Lab</h1>
            <p className="text-xs text-slate-500 truncate max-w-xs">{lab.name}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Step indicator ── */}
      <div className="shrink-0 px-5 py-4 border-b border-white/10 bg-slate-900/40">
        <div className="flex items-center max-w-2xl mx-auto">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const done = num < step;
            const active = num === step;
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                      done
                        ? "bg-medical-600 border-medical-600 text-white"
                        : active
                        ? "bg-slate-900 border-medical-400 text-medical-400 ring-2 ring-medical-400/20"
                        : "bg-slate-800 border-slate-700 text-slate-500"
                    }`}
                  >
                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <p
                    className={`text-xs mt-1.5 font-medium whitespace-nowrap ${
                      active ? "text-medical-300" : done ? "text-slate-400" : "text-slate-600"
                    }`}
                  >
                    {s.label}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-2 mb-5 transition-colors ${
                      done ? "bg-medical-600" : "bg-slate-700"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">

          {/* ════════════════════════════════════════════════════════════
              STEP 1 — Basic Info
          ════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-medical-400" />
                Laboratory Details
              </h2>

              <div>
                <label className={LABEL}>
                  Laboratory Name <span className="text-red-400">*</span>
                </label>
                <input
                  className={INPUT}
                  placeholder="e.g. Lagos General Hospital Diagnostics"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className={LABEL}>
                  Lab Address <span className="text-red-400">*</span>
                </label>
                <input
                  className={INPUT}
                  placeholder="12 Victoria Island, Lagos"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div>
                <label className={LABEL}>
                  Description{" "}
                  <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <textarea
                  rows={4}
                  className={`${INPUT} resize-none`}
                  placeholder="e.g. Specialist diagnostic laboratory offering 200+ tests with same-day results."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <p className={HINT}>Shown on the lab's public profile page.</p>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════
              STEP 2 — Contact
          ════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <>
              {/* Phone numbers */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-medical-400" />
                  Phone Numbers
                  <span className="ml-auto text-xs font-normal text-slate-500">optional</span>
                </h2>
                <div className="space-y-2.5">
                  {phones.map((entry, i) => (
                    <PhoneInput
                      key={i}
                      entry={entry}
                      onChange={(v) => {
                        const next = [...phones];
                        next[i] = v;
                        setPhones(next);
                      }}
                      onRemove={() => setPhones(phones.filter((_, j) => j !== i))}
                      showRemove={phones.length > 1}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setPhones([...phones, { number: "+234 ", label: "" }])}
                    className="flex items-center gap-1.5 text-xs text-medical-400 hover:text-medical-300 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add phone number
                  </button>
                </div>
              </div>

              {/* WhatsApp numbers */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-emerald-400">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp Numbers
                  <span className="ml-auto text-xs font-normal text-slate-500">optional</span>
                </h2>
                <div className="space-y-2.5">
                  {whatsappNumbers.map((num, i) => (
                    <WhatsAppInput
                      key={i}
                      value={num}
                      onChange={(v) => {
                        const next = [...whatsappNumbers];
                        next[i] = v;
                        setWhatsappNumbers(next);
                      }}
                      onRemove={() =>
                        setWhatsappNumbers(whatsappNumbers.filter((_, j) => j !== i))
                      }
                      showRemove={whatsappNumbers.length > 1}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setWhatsappNumbers([...whatsappNumbers, "+234 "])}
                    className="flex items-center gap-1.5 text-xs text-medical-400 hover:text-medical-300 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add WhatsApp number
                  </button>
                </div>
                <p className={HINT}>
                  WhatsApp button appears on the lab's page for patients to reach out directly.
                </p>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              STEP 3 — Services & Certifications
          ════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <>
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-5">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-medical-400" />
                  Service Categories
                  <span className="ml-auto text-xs font-normal text-slate-500">optional</span>
                </h2>
                <SearchableCheckboxGroup
                  label="Services Offered"
                  groups={SERVICE_CATEGORIES}
                  selected={serviceCategories}
                  onChange={setServiceCategories}
                />
                <p className={HINT}>
                  Select all categories that apply to this lab. These appear as filter tags on the
                  public directory.
                </p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-5">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Certifications &amp; Accreditations
                  <span className="ml-auto text-xs font-normal text-slate-500">optional</span>
                </h2>
                <SearchableCheckboxGroup
                  label="Certifications"
                  flatItems={LAB_CERTIFICATIONS}
                  selected={certifications}
                  onChange={setCertifications}
                />
                <p className={HINT}>
                  Certifications are displayed prominently on the lab's public profile as trust
                  badges.
                </p>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              STEP 4 — Branding
          ════════════════════════════════════════════════════════════ */}
          {step === 4 && (
            <>
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-6">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-medical-400" />
                  Images
                </h2>

                {/* Logo */}
                <ImageUploadCard
                  label="Lab Logo"
                  hint="Square image recommended (e.g. 400×400 px). Appears in headers, cards, and navigation."
                  currentUrl={logoUrl}
                  uploading={uploadingLogo}
                  onFileSelect={handleUploadLogo}
                  showRemove={false}
                />

                {/* Hero */}
                <div className="border-t border-slate-700/60 pt-5">
                  <ImageUploadCard
                    label="Hero Background Image"
                    hint="Wide/landscape image recommended (e.g. 1200×400 px). Displayed as the banner on the lab's public page."
                    currentUrl={heroUrl}
                    uploading={uploadingHero || removingHero}
                    onFileSelect={handleUploadHero}
                    onRemove={handleRemoveHero}
                    showRemove={true}
                  />
                </div>
              </div>

              {/* Slug */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-medical-400" />
                  URL Slug
                  <span className="ml-auto text-xs font-normal text-slate-500">optional</span>
                </h2>
                <div>
                  <label className={LABEL}>Custom URL</label>
                  <div className="flex items-center rounded-xl border border-slate-600 bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-medical-400">
                    <span className="px-3 py-2.5 text-sm text-slate-500 bg-slate-900/60 border-r border-slate-700 shrink-0 select-none">
                      poveon.com/
                    </span>
                    <input
                      value={slug}
                      onChange={(e) => {
                        setSlug(e.target.value.toLowerCase());
                        setSlugError("");
                      }}
                      placeholder="apexlabs"
                      className="flex-1 bg-transparent text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none"
                    />
                  </div>
                  {slugError ? (
                    <p className="text-xs text-red-400 mt-1.5">{slugError}</p>
                  ) : (
                    <p className={HINT}>
                      Creates a memorable direct URL. Lowercase letters, numbers, and hyphens only.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              STEP 5 — Notifications
          ════════════════════════════════════════════════════════════ */}
          {step === 5 && (
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-5">
              <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                <Bell className="w-4 h-4 text-medical-400" />
                Email &amp; Notifications
              </h2>

              <div>
                <label className={LABEL}>
                  Branded Notification Email{" "}
                  <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  className={INPUT}
                  placeholder="no-reply@hospital.com"
                  value={notificationEmail}
                  onChange={(e) => setNotificationEmail(e.target.value)}
                />
                <p className={HINT}>
                  All result &amp; alert emails to doctors and patients will appear to come from
                  this address and display the lab's name. Must be verified in Resend first. Leave
                  blank to use{" "}
                  <span className="text-slate-400">notifications@poveon.com</span>.
                </p>
              </div>

              <div className="border-t border-slate-700/60 pt-5">
                <label className={LABEL}>
                  New Request Notification Emails{" "}
                  <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <div className="space-y-2.5">
                  {requestEmails.map((email, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="email"
                        className={INPUT}
                        placeholder="requests@hospital.com"
                        value={email}
                        onChange={(e) => {
                          const next = [...requestEmails];
                          next[i] = e.target.value;
                          setRequestEmails(next);
                        }}
                      />
                      {requestEmails.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setRequestEmails(requestEmails.filter((_, j) => j !== i))
                          }
                          className="shrink-0 p-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/50 transition-colors"
                          aria-label="Remove email"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setRequestEmails([...requestEmails, ""])}
                    className="flex items-center gap-1.5 text-xs text-medical-400 hover:text-medical-300 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add notification email
                  </button>
                </div>
                <p className={HINT}>
                  When a new lab request is submitted, an alert is sent to every address listed here.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Navigation bar ── */}
      <div className="shrink-0 border-t border-white/10 bg-slate-900/80 backdrop-blur-sm px-5 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto gap-3">
          {/* Back / Cancel */}
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 font-medium text-sm transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            {step > 1 ? "Back" : "Cancel"}
          </button>

          {/* Next / Save */}
          {step < STEPS.length ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!stepValid}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-all shadow-lg shadow-medical-600/30 active:scale-95"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-70 text-white font-bold text-sm transition-all shadow-lg shadow-medical-600/30 active:scale-95"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {loading ? "Saving…" : "Save Changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
