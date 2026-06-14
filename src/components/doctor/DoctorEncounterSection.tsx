"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  Loader2, Copy, Check, CreditCard, Users, Wallet, Stethoscope, Link2,
  ChevronDown, ChevronUp, Send, ShieldCheck, TrendingUp, AlertTriangle, ExternalLink,
  ImagePlus, X, Palette, Image as ImageIcon, Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { BankAccountInput } from "@/components/BankAccountInput";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";
import { ENCOUNTER_THEMES, DEFAULT_THEME_ID } from "@/lib/encounter-themes";

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

/** Resolve a Paystack bank code from a saved bank name (older profiles stored name but no code). */
function codeForBankName(name: string | null | undefined): string {
  if (!name) return "";
  const target = name.trim().toLowerCase();
  return NIGERIAN_BANKS.find((b) => b.name.toLowerCase() === target)?.code ?? "";
}

type Pricing = {
  consultation_fee: number | null;
  retainer_monthly: number | null;
  retainer_yearly: number | null;
  bank_name: string | null;
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  has_subaccount: boolean;
  slug: string | null;
  share_url: string | null;
  avatar_url: string | null;
  theme: string | null;
  ready: boolean;
  needs_setup: boolean;
};

type EncounterItem = {
  id: string;
  code: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string;
  patient_age: number | null;
  patient_sex: string | null;
  image_urls: string[];
  conversation: { role: string; content: string }[];
  ai_summary: string | null;
  plan_type: string;
  status: string;
  doctor_note: string | null;
  amount_paid: number;
  doctor_share: number;
  paid_at: string | null;
  created_at: string;
};

type PatientItem = {
  id: string;
  patient_name: string | null;
  patient_email: string;
  patient_phone: string | null;
  subscription_type: string;
  subscription_expires_at: string | null;
  active: boolean;
  total_paid: number;
  encounter_count: number;
};

type Revenue = {
  total: number; this_month: number; encounter_count: number; patient_count: number; active_subscribers: number;
};

const PLAN_LABEL: Record<string, string> = { single: "Single", monthly: "Monthly", yearly: "Yearly" };

export function DoctorEncounterSection({ onReadyChange }: { onReadyChange?: (ready: boolean) => void }) {
  const [view, setView] = useState<"overview" | "encounters" | "patients" | "pricing">("overview");
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [encounters, setEncounters] = useState<EncounterItem[]>([]);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  // Two independent loads so the tab renders instantly: pricing is quick and
  // drives the setup state; the heavier encounters/revenue fills in after.
  const [pricingLoading, setPricingLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  const loadPricing = useCallback(async () => {
    setPricingLoading(true);
    try {
      const r = await fetch("/api/doc-login/pricing");
      const d = await r.json();
      if (d.success) {
        setPricing(d.pricing);
        onReadyChange?.(!!d.pricing?.ready);
        if (d.pricing?.needs_setup) setView("pricing");
      }
    } catch { /* non-blocking */ } finally {
      setPricingLoading(false);
    }
  }, [onReadyChange]);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const r = await fetch("/api/doc-login/encounters");
      const d = await r.json();
      if (d.success) {
        setEncounters(d.encounters);
        setPatients(d.patients);
        setRevenue(d.revenue);
      }
    } catch { /* non-blocking */ } finally {
      setDataLoading(false);
    }
  }, []);

  const reloadAll = useCallback(() => { loadPricing(); loadData(); }, [loadPricing, loadData]);

  useEffect(() => { loadPricing(); loadData(); }, [loadPricing, loadData]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Setup prompt */}
      {pricing?.needs_setup && view !== "pricing" && (
        <button onClick={() => setView("pricing")} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-left hover:bg-amber-100/70 transition">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">Set your prices to start charging</p>
            <p className="text-xs text-amber-700">Add your consultation fee and payout bank to activate your link.</p>
          </div>
          <span className="text-xs font-semibold text-amber-700 shrink-0">Set up →</span>
        </button>
      )}

      {/* Sub-nav — scrollable pills */}
      <div className="-mx-1 px-1 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 min-w-max pb-0.5">
          {([
            ["overview", "Revenue", TrendingUp],
            ["encounters", "Encounters", Stethoscope],
            ["patients", "Patients", Users],
            ["pricing", "Pricing", CreditCard],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setView(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                view === key
                  ? "bg-gradient-to-br from-medical-600 to-medical-700 text-white shadow-md shadow-medical-600/25"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-medical-200 hover:text-slate-800"
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {view === "overview" && <OverviewView pricing={pricing} revenue={revenue} loading={dataLoading} onSetup={() => setView("pricing")} />}
      {view === "encounters" && (dataLoading ? <CardSkeleton /> : <EncountersView encounters={encounters} onChanged={loadData} />)}
      {view === "patients" && (dataLoading ? <CardSkeleton /> : <PatientsView patients={patients} />)}
      {view === "pricing" && (pricingLoading ? <CardSkeleton /> : <PricingView key={pricing?.slug ?? "new"} pricing={pricing} onSaved={reloadAll} />)}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 animate-pulse">
          <div className="h-3 w-28 bg-slate-100 rounded" />
          <div className="h-3 w-40 bg-slate-100 rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

// ── Overview / revenue ───────────────────────────────────────────────────────
function OverviewView({ pricing, revenue, loading, onSetup }: { pricing: Pricing | null; revenue: Revenue | null; loading: boolean; onSetup: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = pricing?.share_url;

  function copy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); toast.success("Link copied"); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div className="space-y-4">
      {/* Share link */}
      {pricing?.ready && shareUrl ? (
        <div className="bg-gradient-to-br from-medical-600 to-medical-800 rounded-2xl p-4 text-white shadow-lg shadow-medical-600/20">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Your patient link</p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 text-sm font-semibold bg-white/15 rounded-lg px-3 py-2 truncate">{shareUrl}</code>
            <button onClick={copy} className="shrink-0 w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition" aria-label="Copy link">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <a href={shareUrl} target="_blank" rel="noreferrer" className="shrink-0 w-9 h-9 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition" aria-label="Open link">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <p className="text-[11px] text-white/70 mt-2">Share this with patients to screen and charge them. You keep 80% of every payment.</p>
        </div>
      ) : (
        <button onClick={onSetup} className="w-full bg-white rounded-2xl border border-slate-100 p-6 text-center hover:border-medical-200 transition">
          <CreditCard className="w-9 h-9 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600">Set up charging to get your shareable link</p>
        </button>
      )}

      {/* Revenue cards */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total earned (80%)" value={loading ? "…" : naira(revenue?.total ?? 0)} icon={Wallet} accent="emerald" />
        <Stat label="This month" value={loading ? "…" : naira(revenue?.this_month ?? 0)} icon={TrendingUp} accent="medical" />
        <Stat label="Encounters" value={loading ? "…" : String(revenue?.encounter_count ?? 0)} icon={Stethoscope} accent="slate" />
        <Stat label="Active subscribers" value={loading ? "…" : String(revenue?.active_subscribers ?? 0)} icon={Users} accent="indigo" />
      </div>

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
        <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">Payments are split automatically at checkout: 80% to your bank, 20% to Poveon. Payouts follow your bank&apos;s settlement schedule.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof Wallet; accent: "emerald" | "medical" | "slate" | "indigo" }) {
  const colors = {
    emerald: "text-emerald-600 bg-emerald-50",
    medical: "text-medical-600 bg-medical-50",
    slate: "text-slate-600 bg-slate-100",
    indigo: "text-indigo-600 bg-indigo-50",
  }[accent];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors}`}><Icon className="w-4 h-4" /></div>
      <p className="text-xl font-black text-slate-800">{value}</p>
      <p className="text-[11px] text-slate-400 font-medium">{label}</p>
    </div>
  );
}

// ── Encounters ───────────────────────────────────────────────────────────────
function EncountersView({ encounters, onChanged }: { encounters: EncounterItem[]; onChanged: () => void }) {
  if (encounters.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
        <Stethoscope className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600">No encounters yet</p>
        <p className="text-xs text-slate-400 mt-1">Share your link to start receiving patient requests.</p>
      </div>
    );
  }
  return <div className="space-y-3">{encounters.map((e) => <EncounterCard key={e.id} enc={e} onChanged={onChanged} />)}</div>;
}

function EncounterCard({ enc, onChanged }: { enc: EncounterItem; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function sendNote() {
    const text = note.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/doc-login/encounters/${enc.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { toast.error(data.error ?? "Failed to send."); return; }
      toast.success("Note sent to patient");
      setNote("");
      onChanged();
    } catch {
      toast.error("Network error.");
    } finally {
      setSending(false);
    }
  }

  const demographics = [enc.patient_age ? `${enc.patient_age} yrs` : null, enc.patient_sex].filter(Boolean).join(", ");

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-800 truncate">{enc.patient_name}</p>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-medical-50 text-medical-600 shrink-0">{PLAN_LABEL[enc.plan_type] ?? enc.plan_type}</span>
            {enc.status === "responded" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 shrink-0">Replied</span>}
          </div>
          <p className="text-xs text-slate-400 truncate">{enc.code} · {demographics || enc.patient_email}</p>
        </div>
        <p className="text-sm font-black text-emerald-600 shrink-0">{naira(enc.doctor_share)}</p>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <a href={`mailto:${enc.patient_email}`} className="text-medical-600 truncate">{enc.patient_email}</a>
            <a href={`tel:${enc.patient_phone}`} className="text-medical-600 truncate">{enc.patient_phone}</a>
          </div>

          {enc.image_urls.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {enc.image_urls.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={i} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Photo ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200" /></a>
              ))}
            </div>
          )}

          {enc.ai_summary && (
            <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 mb-1">AI summary</p>
              <p className="text-xs text-amber-800 leading-relaxed whitespace-pre-wrap">{enc.ai_summary}</p>
            </div>
          )}

          {enc.conversation.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Questions &amp; answers</p>
              {enc.conversation.map((m, i) => (
                <div key={i} className={`text-xs px-3 py-2 rounded-lg ${m.role === "user" ? "bg-medical-50 text-medical-800" : "bg-slate-50 text-slate-600"}`}>
                  <span className="font-bold">{m.role === "user" ? "Patient: " : "Assistant: "}</span>{m.content}
                </div>
              ))}
            </div>
          )}

          {enc.doctor_note && (
            <div className="px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-1">Your note</p>
              <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-wrap">{enc.doctor_note}</p>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Write a note to the patient…"
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-medical-400 transition" />
            <button onClick={sendNote} disabled={!note.trim() || sending}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-40 text-white text-xs font-semibold transition">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Patients ─────────────────────────────────────────────────────────────────
function PatientsView({ patients }: { patients: PatientItem[] }) {
  if (patients.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
        <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-600">No patients yet</p>
        <p className="text-xs text-slate-400 mt-1">Patients appear here after their first paid encounter.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {patients.map((p) => (
        <div key={p.id} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{p.patient_name || p.patient_email}</p>
            <p className="text-xs text-slate-400 truncate">{p.patient_phone || p.patient_email} · {p.encounter_count} encounter{p.encounter_count === 1 ? "" : "s"}</p>
          </div>
          <div className="text-right shrink-0">
            {p.subscription_type !== "none" && p.active ? (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600">{PLAN_LABEL[p.subscription_type]} · active</span>
            ) : p.subscription_type !== "none" ? (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">Expired</span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">Pay-per-visit</span>
            )}
            <p className="text-xs font-black text-slate-700 mt-1">{naira(p.total_paid)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Pricing setup ────────────────────────────────────────────────────────────
function PricingView({ pricing, onSaved }: { pricing: Pricing | null; onSaved: () => void }) {
  const [consult, setConsult] = useState(pricing?.consultation_fee ? String(pricing.consultation_fee) : "");
  const [monthly, setMonthly] = useState(pricing?.retainer_monthly ? String(pricing.retainer_monthly) : "");
  const [yearly, setYearly] = useState(pricing?.retainer_yearly ? String(pricing.retainer_yearly) : "");
  const [bankName, setBankName] = useState(pricing?.bank_name ?? "");
  // Older profiles saved bank_name without a code — derive it so autofilled
  // bank details are valid immediately (no need to re-pick the bank to save).
  const [bankCode, setBankCode] = useState(pricing?.bank_code || codeForBankName(pricing?.bank_name));
  const [accountNumber, setAccountNumber] = useState(pricing?.account_number ?? "");
  const [accountName, setAccountName] = useState(pricing?.account_name ?? "");
  const [verified, setVerified] = useState(!!pricing?.account_name);
  const [saving, setSaving] = useState(false);
  // Once configured, show a read-only summary with an Edit button.
  const [editing, setEditing] = useState(false);

  const num = (s: string) => { const n = parseInt(s.replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : 0; };
  // Allow saving once we have a fee + a 10-digit account + a confirmed account name.
  // bankCode is needed for the payout subaccount, but if an older profile has the
  // name/number/name verified we still let them save (subaccount is best-effort).
  const haveBank = !!bankCode || (!!bankName && accountNumber.length === 10 && !!accountName);
  const canSave = num(consult) > 0 && haveBank && accountNumber.length === 10 && (verified || !!accountName);

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doc-login/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consultation_fee: num(consult),
          retainer_monthly: monthly ? num(monthly) : null,
          retainer_yearly: yearly ? num(yearly) : null,
          bank_name: bankName,
          bank_code: bankCode,
          account_number: accountNumber,
          account_name: accountName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { toast.error(data.error ?? "Failed to save."); return; }
      toast.success("Pricing saved — your link is live!");
      setEditing(false);
      onSaved();
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  // Configured doctors see a summary card; editing reveals the full form.
  if (pricing?.ready && !editing) {
    const acct = pricing.account_number ? `•••• ${pricing.account_number.slice(-4)}` : "";
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-medical-500" /> Pricing &amp; payout</h3>
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-medical-50 text-medical-700 hover:bg-medical-100 transition shrink-0">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <SummaryStat label="Per encounter" value={naira(pricing.consultation_fee ?? 0)} />
            <SummaryStat label="Monthly" value={pricing.retainer_monthly ? naira(pricing.retainer_monthly) : "—"} />
            <SummaryStat label="Yearly" value={pricing.retainer_yearly ? naira(pricing.retainer_yearly) : "—"} />
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><Wallet className="w-4 h-4" /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">{pricing.account_name || pricing.bank_name || "Payout account"}</p>
              <p className="text-[11px] text-slate-400 truncate">{[pricing.bank_name, acct].filter(Boolean).join(" · ")}</p>
            </div>
            {pricing.has_subaccount && <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 shrink-0">Auto-split on</span>}
          </div>
        </div>

        {/* Page customization — avatar + theme */}
        <EncounterPageCard pricing={pricing} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-medical-500" /> Your prices</h3>
          <p className="text-xs text-slate-400 mt-1">Set what patients pay. You keep 80% of every payment.</p>
        </div>
        <FeeInput label="Consultation fee (per encounter)" required value={consult} onChange={setConsult} hint="Charged for a single encounter." />
        <FeeInput label="Monthly retainership" value={monthly} onChange={setMonthly} hint="Optional — leave blank to disable." />
        <FeeInput label="Yearly retainership" value={yearly} onChange={setYearly} hint="Optional — leave blank to disable." />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Wallet className="w-4 h-4 text-medical-500" /> Payout account</h3>
          <p className="text-xs text-slate-400 mt-1">Your 80% share is paid here automatically by Paystack.</p>
        </div>
        <BankAccountInput
          bankName={bankName} bankCode={bankCode} accountNumber={accountNumber} accountName={accountName}
          onBankChange={(name, code) => { setBankName(name); setBankCode(code); }}
          onAccountNumberChange={setAccountNumber}
          onAccountNameChange={setAccountName}
          onVerifiedChange={setVerified}
        />
      </div>

      {/* Page customization — avatar + theme */}
      <EncounterPageCard pricing={pricing} />

      <div className="flex items-center gap-2">
        {pricing?.ready && (
          <button onClick={() => setEditing(false)} className="px-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition shrink-0">
            Cancel
          </button>
        )}
        <button onClick={save} disabled={!canSave || saving}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-medical-600 hover:bg-medical-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-medical-600/30 transition-all">
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
          {saving ? "Saving…" : pricing?.ready ? "Save changes" : "Save & activate my link"}
        </button>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-800 mt-0.5 truncate">{value}</p>
    </div>
  );
}

function FeeInput({ label, value, onChange, hint, required }: { label: string; value: string; onChange: (v: string) => void; hint?: string; required?: boolean }) {
  return (
    <div className="relative">
      <Input label={label} required={required} inputMode="numeric" placeholder="e.g. 5000" value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))} hint={hint} className="pl-7" />
      <span className="absolute left-3 top-[34px] text-sm text-slate-400 font-semibold">₦</span>
    </div>
  );
}

// ── Encounter page customization: profile photo + colour theme ────────────────
// Self-contained: persists changes inline without reloading the whole section.
function EncounterPageCard({ pricing }: { pricing: Pricing | null }) {
  const [avatar, setAvatar] = useState<string | null>(pricing?.avatar_url ?? null);
  const [theme, setTheme] = useState<string>(pricing?.theme ?? DEFAULT_THEME_ID);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/doc-login/avatar", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Upload failed."); return; }
      setAvatar(d.url);
      toast.success("Photo updated");
    } catch {
      toast.error("Network error.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatar(null);
    await fetch("/api/doc-login/avatar", { method: "DELETE" }).catch(() => {});
  }

  async function pickTheme(id: string) {
    setTheme(id);
    try {
      const res = await fetch("/api/doc-login/encounter-page", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: id }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) { toast.error(d.error ?? "Failed to update theme."); return; }
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><ImageIcon className="w-4 h-4 text-medical-500" /> Your page</h3>
        <p className="text-xs text-slate-400 mt-1">Personalise the page patients see. Optional.</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
          {uploading ? <Loader2 className="w-5 h-5 text-medical-500 animate-spin" />
            : avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : <ImagePlus className="w-6 h-6 text-slate-300" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-700">Profile photo</p>
          <div className="flex items-center gap-2 mt-1.5">
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-medical-50 text-medical-700 hover:bg-medical-100 disabled:opacity-50 transition">
              {avatar ? "Change" : "Upload"}
            </button>
            {avatar && (
              <button onClick={removeAvatar} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition flex items-center gap-1">
                <X className="w-3 h-3" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Theme — mini page previews */}
      <div>
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-2"><Palette className="w-3.5 h-3.5 text-medical-500" /> Page theme</p>
        <div className="grid grid-cols-3 gap-2.5">
          {ENCOUNTER_THEMES.map((t) => {
            const selected = theme === t.id;
            return (
              <button key={t.id} onClick={() => pickTheme(t.id)}
                className={`rounded-xl overflow-hidden border-2 transition ${selected ? "border-medical-600 ring-2 ring-medical-100" : "border-slate-200 hover:border-slate-300"}`}>
                <div className={`h-12 ${t.pageBg} flex items-center justify-center gap-1`}>
                  <span className={`w-6 h-6 rounded-lg bg-gradient-to-br ${t.heroGradient} shadow-sm`} />
                </div>
                <div className="flex items-center justify-center gap-1 py-1.5 bg-white">
                  <span className="text-[10px] font-semibold text-slate-600">{t.label}</span>
                  {selected && <Check className="w-3 h-3 text-medical-600" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
