"use client";

import { useState, useRef } from "react";
import { toast } from "react-hot-toast";
import {
  X, Check, Upload, RefreshCw, Eye, EyeOff,
  ChevronRight, ChevronLeft, Plus, Trash2,
  Building2, Phone, Image as ImageIcon, Bell, Copy,
} from "lucide-react";
import type { PhoneEntry } from "@/lib/types";
import { STATE_NAMES, lgasForState } from "@/lib/nigeria-locations";
import { FuzzyCombo } from "@/components/ui/FuzzyCombo";
import { AdminOverlay } from "@/components/admin/AdminOverlay";

// ── Shared constants ──────────────────────────────────────────────────────────

const COUNTRY_CODES = [
  { code: "+234", label: "🇳🇬 Nigeria (+234)", flag: "🇳🇬" },
  { code: "+1",   label: "🇺🇸 US/Canada (+1)", flag: "🇺🇸" },
  { code: "+44",  label: "🇬🇧 UK (+44)", flag: "🇬🇧" },
  { code: "+27",  label: "🇿🇦 South Africa (+27)", flag: "🇿🇦" },
  { code: "+233", label: "🇬🇭 Ghana (+233)", flag: "🇬🇭" },
  { code: "+254", label: "🇰🇪 Kenya (+254)", flag: "🇰🇪" },
  { code: "+256", label: "🇺🇬 Uganda (+256)", flag: "🇺🇬" },
  { code: "+255", label: "🇹🇿 Tanzania (+255)", flag: "🇹🇿" },
  { code: "+251", label: "🇪🇹 Ethiopia (+251)", flag: "🇪🇹" },
  { code: "+212", label: "🇲🇦 Morocco (+212)", flag: "🇲🇦" },
  { code: "+20",  label: "🇪🇬 Egypt (+20)", flag: "🇪🇬" },
  { code: "+971", label: "🇦🇪 UAE (+971)", flag: "🇦🇪" },
  { code: "+91",  label: "🇮🇳 India (+91)", flag: "🇮🇳" },
  { code: "+86",  label: "🇨🇳 China (+86)", flag: "🇨🇳" },
];

function parseDialCode(full: string): { dial: string; local: string } {
  for (const c of COUNTRY_CODES) {
    if (full.startsWith(c.code)) {
      return { dial: c.code, local: full.slice(c.code.length).trimStart() };
    }
  }
  return { dial: "+234", local: full.startsWith("+") ? full.replace(/^\+\d{1,4}/, "").trimStart() : full };
}

const INPUT = "w-full rounded-xl border border-slate-600 bg-slate-800 text-white placeholder-slate-400 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 transition-colors";
const LABEL = "text-sm font-semibold text-slate-200 block mb-1.5";
const HINT = "text-xs text-slate-500 mt-1.5 leading-relaxed";

// ── Phone number input with country code dropdown ─────────────────────────────

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
          className="shrink-0 rounded-xl border border-slate-600 bg-slate-800 text-white text-sm px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-medical-400 transition-colors"
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
          className="flex-1 min-w-0 rounded-xl border border-slate-600 bg-slate-800 text-white placeholder-slate-400 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 transition-colors"
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
        className="w-full rounded-xl border border-slate-700 bg-slate-900/60 text-white placeholder-slate-500 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-medical-400 transition-colors"
      />
    </div>
  );
}

// ── WhatsApp input with country code ─────────────────────────────────────────

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
        className="shrink-0 rounded-xl border border-slate-600 bg-slate-800 text-white text-sm px-2 py-2.5 focus:outline-none focus:ring-2 focus:ring-medical-400 transition-colors"
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
        className="flex-1 min-w-0 rounded-xl border border-slate-600 bg-slate-800 text-white placeholder-slate-400 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 transition-colors"
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

// ── Steps ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { label: "Basic Info", icon: Building2 },
  { label: "Contact", icon: Phone },
  { label: "Branding", icon: ImageIcon },
  { label: "Settings", icon: Bell },
];

// ── Image upload section ──────────────────────────────────────────────────────

function ImageUploadCard({
  label,
  hint,
  currentUrl,
  uploading,
  onFileSelect,
}: {
  label: string;
  hint: string;
  currentUrl: string;
  uploading: boolean;
  onFileSelect: (f: File) => void;
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors disabled:opacity-60"
      >
        {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {uploading ? "Uploading…" : currentUrl ? "Replace Image" : "Upload Image"}
      </button>
      <p className={HINT}>{hint}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CreateLabForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(1);

  // Step 1
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [stateName, setStateName] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");

  // Step 2
  const [phones, setPhones] = useState<PhoneEntry[]>([{ number: "+234 ", label: "" }]);
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>(["+234 "]);

  // Step 3
  const [slug, setSlug] = useState("");
  const [slugError, setSlugError] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [heroUrl, setHeroUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);

  // Step 4
  const [notificationEmail, setNotificationEmail] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // State
  const [loading, setLoading] = useState(false);
  const [createdLabId, setCreatedLabId] = useState("");
  const [createdPassword, setCreatedPassword] = useState("");

  const stepValid = (() => {
    if (step === 1) return !!name.trim() && !!email.trim() && !!address.trim() && !!stateName;
    if (step === 3 && slug.trim()) return /^[a-z0-9-]+$/.test(slug.trim());
    return true;
  })();

  function handleNext() {
    if (step === 3 && slug.trim() && !/^[a-z0-9-]+$/.test(slug.trim())) {
      setSlugError("Only lowercase letters, numbers, and hyphens allowed");
      return;
    }
    setStep((s) => s + 1);
  }

  async function handleCreate() {
    const phoneList = phones
      .map((p) => ({ number: p.number.trim(), label: p.label.trim() }))
      .filter((p) => p.number && p.number.replace(/[\s+\d]/g, "").length === 0 ? false : p.number.replace(/\D/g, "").length >= 7);

    if (slug.trim() && !/^[a-z0-9-]+$/.test(slug.trim())) {
      setSlugError("Only lowercase letters, numbers, and hyphens allowed");
      setStep(3);
      return;
    }

    const waNumbers = whatsappNumbers.map((n) => n.trim()).filter((n) => n.replace(/\D/g, "").length >= 7);

    setLoading(true);
    try {
      const res = await fetch("/api/admin/create-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          address: address.trim(),
          state: stateName || null,
          city: city || null,
          description: description.trim() || undefined,
          phones: phoneList,
          notification_email: notificationEmail.trim() || undefined,
          slug: slug.trim() || undefined,
          whatsapp: waNumbers.length ? JSON.stringify(waNumbers) : undefined,
          request_email: requestEmail.trim() || undefined,
          tempPassword: tempPassword.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedLabId(data.lab.id);
        setCreatedPassword(data.tempPassword);
        toast.success(`Lab "${name}" created!`);
      } else {
        toast.error(data.error ?? "Failed to create lab");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(file: File, type: "logo" | "hero") {
    if (!createdLabId) return;
    const setter = type === "logo" ? setUploadingLogo : setUploadingHero;
    setter(true);
    try {
      const fd = new FormData();
      fd.append(type, file);
      const endpoint =
        type === "logo"
          ? `/api/admin/labs/${createdLabId}/logo`
          : `/api/admin/labs/${createdLabId}/hero`;
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        if (type === "logo") setLogoUrl(data.logo_url);
        else setHeroUrl(data.hero_image_url);
        toast.success(`${type === "logo" ? "Logo" : "Hero image"} uploaded!`);
      } else {
        toast.error(data.error ?? "Upload failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setter(false);
    }
  }

  // Success screen
  if (createdPassword) {
    return (
      <AdminOverlay onClose={onClose} align="fullscreen">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-6 animate-slide-up">
            {/* Header */}
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">Lab Created!</h2>
              <p className="text-slate-400">Credentials have been sent to {email}</p>
            </div>

            {/* Temp password */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">Temporary Password</p>
              <div className="flex items-center gap-3">
                <p className="font-mono text-2xl font-bold text-amber-300 flex-1">{createdPassword}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(createdPassword); toast.success("Copied!"); }}
                  className="p-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Media uploads */}
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 space-y-5">
              <p className="text-sm font-semibold text-slate-200">Upload Media <span className="text-slate-500 font-normal">(optional)</span></p>
              <ImageUploadCard
                label="Lab Logo"
                hint="Square image recommended. Shows in headers, cards, and navigation."
                currentUrl={logoUrl}
                uploading={uploadingLogo}
                onFileSelect={(f) => handleUpload(f, "logo")}
              />
              <ImageUploadCard
                label="Hero Background Image"
                hint="Wide/landscape image recommended. Displayed as the background on the lab's unique page."
                currentUrl={heroUrl}
                uploading={uploadingHero}
                onFileSelect={(f) => handleUpload(f, "hero")}
              />
            </div>

            <button
              onClick={onSuccess}
              className="w-full py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 text-white font-bold text-sm transition-all shadow-lg shadow-medical-600/30"
            >
              Done
            </button>
          </div>
        </div>
      </AdminOverlay>
    );
  }

  return (
    <AdminOverlay onClose={onClose} align="fullscreen">
      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-medical-600/20 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-medical-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">Add New Laboratory</h1>
            <p className="text-xs text-slate-500">Step {step} of {STEPS.length}</p>
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
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                    done
                      ? "bg-medical-600 border-medical-600 text-white"
                      : active
                      ? "bg-slate-900 border-medical-400 text-medical-400 ring-2 ring-medical-400/20"
                      : "bg-slate-800 border-slate-700 text-slate-500"
                  }`}>
                    {done ? <Check className="w-4 h-4" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <p className={`text-xs mt-1.5 font-medium whitespace-nowrap ${
                    active ? "text-medical-300" : done ? "text-slate-400" : "text-slate-600"
                  }`}>
                    {s.label}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 mb-5 transition-colors ${done ? "bg-medical-600" : "bg-slate-700"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable step content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">

          {/* ── Step 1: Basic Info ── */}
          {step === 1 && (
            <>
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-medical-400" />
                  Laboratory Details
                </h2>
                <div>
                  <label className={LABEL}>Laboratory Name <span className="text-red-400">*</span></label>
                  <input
                    className={INPUT}
                    placeholder="e.g. Lagos General Hospital Diagnostics"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className={LABEL}>Lab Login Email <span className="text-red-400">*</span></label>
                  <input
                    type="email"
                    className={INPUT}
                    placeholder="lab@hospital.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className={HINT}>This becomes the lab's login credential to the dashboard.</p>
                </div>
                <div>
                  <label className={LABEL}>Location <span className="text-red-400">*</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="admin-combo">
                      <FuzzyCombo
                        value={stateName}
                        onChange={(v) => { setStateName(v); setCity(""); }}
                        options={STATE_NAMES}
                        placeholder="State *"
                      />
                    </div>
                    <div className="admin-combo">
                      <FuzzyCombo
                        value={city}
                        onChange={setCity}
                        options={lgasForState(stateName)}
                        placeholder={stateName ? "Local government" : "Pick a state first"}
                        disabled={!stateName}
                        allowCustom
                      />
                    </div>
                  </div>
                  <p className={HINT}>Patients filter partner labs and pharmacies by state.</p>
                </div>
                <div>
                  <label className={LABEL}>Street Address <span className="text-red-400">*</span></label>
                  <input
                    className={INPUT}
                    placeholder="12 Adeola Odeku Street, Victoria Island"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div>
                  <label className={LABEL}>Description <span className="text-slate-500 font-normal">(optional)</span></label>
                  <textarea
                    rows={3}
                    className={`${INPUT} resize-none`}
                    placeholder="e.g. Specialist diagnostic laboratory offering 200+ tests with same-day results."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <p className={HINT}>Shown on the lab's public profile page.</p>
                </div>
              </div>
            </>
          )}

          {/* ── Step 2: Contact ── */}
          {step === 2 && (
            <>
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
                      onChange={(v) => { const next = [...phones]; next[i] = v; setPhones(next); }}
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

              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-emerald-400">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  WhatsApp Numbers
                  <span className="ml-auto text-xs font-normal text-slate-500">optional</span>
                </h2>
                <div className="space-y-2.5">
                  {whatsappNumbers.map((num, i) => (
                    <WhatsAppInput
                      key={i}
                      value={num}
                      onChange={(v) => { const next = [...whatsappNumbers]; next[i] = v; setWhatsappNumbers(next); }}
                      onRemove={() => setWhatsappNumbers(whatsappNumbers.filter((_, j) => j !== i))}
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
                <p className={HINT}>WhatsApp button appears on the lab's page for patients to reach out directly.</p>
              </div>
            </>
          )}

          {/* ── Step 3: Branding ── */}
          {step === 3 && (
            <>
              <div className="bg-slate-800/40 border border-amber-500/20 rounded-2xl p-5 space-y-1">
                <p className="text-xs text-amber-400 font-semibold">Note</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Images can only be uploaded after the lab is created. Set the slug here, then images can be uploaded on the success screen or later in the Edit form.
                </p>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-5">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-medical-400" />
                  Branding & URL
                </h2>

                <div>
                  <label className={LABEL}>URL Slug <span className="text-slate-500 font-normal">(optional)</span></label>
                  <div className="flex items-center rounded-xl border border-slate-600 bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-medical-400">
                    <span className="px-3 py-2.5 text-sm text-slate-500 bg-slate-900/60 border-r border-slate-700 shrink-0 select-none">
                      poveon.com/
                    </span>
                    <input
                      value={slug}
                      onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugError(""); }}
                      placeholder="apexlabs"
                      className="flex-1 bg-transparent text-white placeholder-slate-500 px-3 py-2.5 text-sm focus:outline-none"
                    />
                  </div>
                  {slugError ? (
                    <p className="text-xs text-red-400 mt-1.5">{slugError}</p>
                  ) : (
                    <p className={HINT}>Creates a memorable direct URL for the lab. Lowercase letters, numbers, hyphens only.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Step 4: Settings ── */}
          {step === 4 && (
            <>
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-5">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-medical-400" />
                  Email & Notifications
                </h2>

                <div>
                  <label className={LABEL}>Branded Notification Email <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input
                    type="email"
                    className={INPUT}
                    placeholder="no-reply@hospital.com"
                    value={notificationEmail}
                    onChange={(e) => setNotificationEmail(e.target.value)}
                  />
                  <p className={HINT}>All result & alert emails to doctors and patients will appear to come from this address and display the lab's name. Must be verified in Resend first. Leave blank to use <span className="text-slate-400">notifications@poveon.com</span>.</p>
                </div>

                <div>
                  <label className={LABEL}>New Request Notification Email <span className="text-slate-500 font-normal">(optional)</span></label>
                  <input
                    type="email"
                    className={INPUT}
                    placeholder="requests@hospital.com"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                  />
                  <p className={HINT}>When a new lab request is submitted, an alert is sent to this address.</p>
                </div>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-5 space-y-4">
                <h2 className="text-base font-bold text-white pb-3 border-b border-slate-700/60">
                  Access Credentials
                </h2>
                <div>
                  <label className={LABEL}>Temporary Password <span className="text-slate-500 font-normal">(optional)</span></label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={`${INPUT} pr-11`}
                      placeholder="Leave blank to auto-generate a secure password"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className={HINT}>Min 8 characters. A secure random password is auto-generated if left blank.</p>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── Navigation bar ── */}
      <div className="shrink-0 border-t border-white/10 bg-slate-900/80 backdrop-blur-sm px-5 py-4">
        <div className="flex items-center justify-between max-w-2xl mx-auto gap-3">
          <button
            type="button"
            onClick={() => step > 1 ? setStep((s) => s - 1) : onClose()}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 font-medium text-sm transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            {step > 1 ? "Back" : "Cancel"}
          </button>

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
              onClick={handleCreate}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-70 text-white font-bold text-sm transition-all shadow-lg shadow-medical-600/30 active:scale-95"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
              {loading ? "Creating…" : "Create Lab"}
            </button>
          )}
        </div>
      </div>
    </AdminOverlay>
  );
}
