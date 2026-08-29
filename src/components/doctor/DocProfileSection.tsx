"use client";

/**
 * The doctor's profile form.
 *
 * Lifted out of the dashboard page so its inputs — the phone field, the bank
 * account lookup, the prefix select, the hospital tag input — stop shipping to
 * everyone who opens the dashboard to look at their care-plan members.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  Building2, Check, CheckCircle, ChevronRight, CreditCard, Info, Pencil, RefreshCw, User, X,
} from "lucide-react";
import { PhoneInput } from "@/components/PhoneInput";
import { BankAccountInput } from "@/components/BankAccountInput";
import { PrefixSelect } from "@/components/PrefixSelect";
import { HospitalTagInput } from "@/components/ui/HospitalTagInput";
import type { DoctorProfileData, OnboardStep } from "@/components/doctor/doctor-profile-types";

export function DocProfileSection({
  email,
  initialProfile,
  onProfileUpdate,
}: {
  email: string;
  initialProfile: DoctorProfileData | null;
  onProfileUpdate: (p: DoctorProfileData) => void;
}) {
  const [profile, setProfile] = useState<DoctorProfileData>(
    initialProfile ?? { prefix: null, full_name: null, phone: null, hospitals: [], bank_name: null, account_number: null, account_name: null }
  );
  const [onboardStep, setOnboardStep] = useState<OnboardStep>(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  // Editing states per section
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [editingHospital, setEditingHospital] = useState(false);
  const [editingBank, setEditingBank] = useState(false);
  // Local form values
  const [localPrefix, setLocalPrefix] = useState(profile.prefix ?? "");
  const [localName, setLocalName] = useState(profile.full_name ?? "");
  const [localPhone, setLocalPhone] = useState(profile.phone ?? "");
  const [localHospitals, setLocalHospitals] = useState<string[]>(profile.hospitals ?? []);
  const [localBankName, setLocalBankName] = useState(profile.bank_name ?? "");
  const [localBankCode, setLocalBankCode] = useState("");
  const [localAccountNumber, setLocalAccountNumber] = useState(profile.account_number ?? "");
  const [localAccountName, setLocalAccountName] = useState(profile.account_name ?? "");
  const [bankVerified, setBankVerified] = useState(!!(profile.bank_name && profile.account_number && profile.account_name));
  const [bankSkipped, setBankSkipped] = useState(false);

  const isOnboarding = !profile.full_name;

  async function saveFields(fields: Partial<DoctorProfileData>) {
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const res = await fetch("/api/doc-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) { setSaveError(data.error ?? "Failed to save."); return false; }
      const updated = { ...profile, ...data.profile };
      setProfile(updated);
      onProfileUpdate(updated);
      setSaveSuccess("Saved!");
      setTimeout(() => setSaveSuccess(""), 2500);
      return true;
    } catch {
      setSaveError("Network error. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function savePersonal() {
    const ok = await saveFields({ prefix: localPrefix || null, full_name: localName || null, phone: localPhone || null });
    if (ok) {
      setEditingPersonal(false);
      if (isOnboarding) setOnboardStep(2);
    }
  }

  async function saveHospital() {
    const ok = await saveFields({ hospitals: localHospitals });
    if (ok) {
      setEditingHospital(false);
      if (isOnboarding) setOnboardStep(3);
    }
  }

  async function saveBank() {
    if (!bankVerified) { setSaveError("Please verify your bank account first."); return; }
    const ok = await saveFields({ bank_name: localBankName || null, account_number: localAccountNumber || null, account_name: localAccountName || null });
    if (ok) setEditingBank(false);
  }

  // Onboarding progress
  const step1Done = !!(profile.full_name);
  const step2Done = profile.hospitals.length > 0;
  const step3Done = !!(profile.bank_name && profile.account_number);
  const allDone = step1Done && step2Done && step3Done;

  if (isOnboarding) {
    // ── Onboarding Wizard ──────────────────────────────────────────────
    return (
      <div className="space-y-4">
        {/* Progress */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-xl bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0">
              <User className="w-3.5 h-3.5 text-medical-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Set up your profile</p>
              <p className="text-xs text-slate-400">Helps labs and admins know who you are</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map((s) => {
              const done = s === 1 ? step1Done : s === 2 ? step2Done : step3Done;
              const active = onboardStep === s && !done;
              return (
                <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${done ? "bg-emerald-400" : active ? "bg-medical-400" : "bg-slate-200"}`} />
              );
            })}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-slate-400">Your details</span>
            <span className="text-xs text-slate-400">Hospital</span>
            <span className="text-xs text-slate-400">Bank (optional)</span>
          </div>
        </div>

        {/* Step 1: Personal details */}
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${step1Done ? "border-emerald-200" : onboardStep === 1 ? "border-medical-200" : "border-slate-100"}`}>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${step1Done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-medical-400 text-medical-600"}`}>
              {step1Done ? <Check className="w-3.5 h-3.5" /> : "1"}
            </div>
            <p className="text-sm font-semibold text-slate-700 flex-1">Your name &amp; contact</p>
            {step1Done && !editingPersonal && (
              <button onClick={() => setEditingPersonal(true)} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>

          {(onboardStep === 1 || editingPersonal) && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
              {/* Prefix */}
              <PrefixSelect value={localPrefix} onChange={setLocalPrefix} />
              {/* Full Name */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Firstname Lastname"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition"
                />
              </div>
              {/* Phone */}
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Phone Number</label>
                <PhoneInput value={localPhone} onChange={setLocalPhone} />
              </div>
              {saveError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>}
              <button
                onClick={savePersonal}
                disabled={saving || !localName.trim() || !localPrefix}
                className="w-full py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {saving ? "Saving…" : "Save & Continue"}
              </button>
            </div>
          )}
          {step1Done && !editingPersonal && (
            <div className="px-4 pb-3 text-xs text-slate-600 space-y-1 border-t border-slate-50 pt-2">
              <p><span className="text-slate-400">Name:</span> {[profile.prefix, profile.full_name].filter(Boolean).join(" ")}</p>
              {profile.phone && <p><span className="text-slate-400">Phone:</span> {profile.phone}</p>}
            </div>
          )}
        </div>

        {/* Step 2: Hospital */}
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${step2Done ? "border-emerald-200" : onboardStep === 2 ? "border-medical-200" : "border-slate-100 opacity-60"}`}>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${step2Done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-medical-400 text-medical-600"}`}>
              {step2Done ? <Check className="w-3.5 h-3.5" /> : "2"}
            </div>
            <p className="text-sm font-semibold text-slate-700 flex-1">Hospital or Clinic</p>
            {step2Done && !editingHospital && (
              <button onClick={() => setEditingHospital(true)} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>

          {onboardStep >= 2 && (onboardStep === 2 || editingHospital) && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Hospital / Clinic Name</label>
                <HospitalTagInput value={localHospitals} onChange={setLocalHospitals} />
              </div>
              {saveError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>}
              <button
                onClick={saveHospital}
                disabled={saving || localHospitals.length === 0}
                className="w-full py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {saving ? "Saving…" : "Save & Continue"}
              </button>
            </div>
          )}
          {step2Done && !editingHospital && (
            <div className="px-4 pb-3 text-xs text-slate-600 border-t border-slate-50 pt-2">
              <span className="text-slate-400">Hospital:</span> {profile.hospitals.join(", ")}
            </div>
          )}
        </div>

        {/* Step 3: Bank Details (optional) */}
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors ${step3Done ? "border-emerald-200" : onboardStep === 3 ? "border-amber-200" : "border-slate-100 opacity-60"}`}>
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${step3Done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-amber-400 text-amber-600"}`}>
              {step3Done ? <Check className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700">Bank Details <span className="text-xs font-normal text-slate-400">(optional)</span></p>
              <p className="text-xs text-slate-400">For referral commission payments</p>
            </div>
            {step3Done && !editingBank && (
              <button onClick={() => setEditingBank(true)} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors shrink-0">
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
          </div>

          {onboardStep >= 3 && !bankSkipped && (onboardStep === 3 || editingBank) && (
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
              <BankAccountInput
                bankName={localBankName}
                bankCode={localBankCode}
                accountNumber={localAccountNumber}
                accountName={localAccountName}
                onBankChange={(name, code) => { setLocalBankName(name); setLocalBankCode(code); setBankVerified(false); }}
                onAccountNumberChange={(v) => { setLocalAccountNumber(v); setBankVerified(false); }}
                onAccountNameChange={setLocalAccountName}
                onVerifiedChange={setBankVerified}
              />
              {saveError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</p>}
              {saveSuccess && <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{saveSuccess}</p>}
              <div className="flex gap-2">
                <button
                  onClick={saveBank}
                  disabled={saving || !bankVerified}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? "Saving…" : "Save Bank Details"}
                </button>
                <button
                  onClick={() => setBankSkipped(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition"
                >
                  Skip
                </button>
              </div>
            </div>
          )}
          {onboardStep >= 3 && bankSkipped && !step3Done && (
            <div className="px-4 pb-3 flex items-center justify-between border-t border-slate-50 pt-2.5">
              <p className="text-xs text-slate-400">Bank details skipped</p>
              <button onClick={() => setBankSkipped(false)} className="text-xs text-medical-600 underline underline-offset-2 font-medium transition-colors">Add later</button>
            </div>
          )}
          {step3Done && !editingBank && (
            <div className="px-4 pb-3 text-xs text-slate-600 space-y-0.5 border-t border-slate-50 pt-2">
              <p><span className="text-slate-400">Bank:</span> {profile.bank_name}</p>
              <p><span className="text-slate-400">Account:</span> {profile.account_number} · {profile.account_name}</p>
            </div>
          )}
        </div>

        {allDone && (
          <div className="flex items-center gap-3 px-4 py-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Profile complete!</p>
              <p className="text-xs text-emerald-700">Your details will be auto-filled on all future requests.</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Completed Profile View ─────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {saveSuccess && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-semibold text-emerald-700">{saveSuccess}</p>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl">
          <X className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-xs font-semibold text-red-600">{saveError}</p>
        </div>
      )}

      {/* Personal Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100">
          <User className="w-4 h-4 text-medical-600 shrink-0" />
          <p className="text-sm font-bold text-slate-800 flex-1">Personal Details</p>
          <button onClick={() => { setEditingPersonal((v) => !v); setSaveError(""); }} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors">
            {editingPersonal ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {editingPersonal ? "Cancel" : "Edit"}
          </button>
        </div>
        {!editingPersonal ? (
          <div className="px-4 py-3 space-y-1.5 text-xs text-slate-600">
            <p><span className="text-slate-400 w-16 inline-block">Name</span>{[profile.prefix, profile.full_name].filter(Boolean).join(" ") || "—"}</p>
            <p><span className="text-slate-400 w-16 inline-block">Email</span>{email}</p>
            {profile.phone && <p><span className="text-slate-400 w-16 inline-block">Phone</span>{profile.phone}</p>}
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3 space-y-3">
            <PrefixSelect value={localPrefix} onChange={setLocalPrefix} />
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Full Name</label>
              <input type="text" value={localName} onChange={(e) => setLocalName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Phone Number</label>
              <PhoneInput value={localPhone} onChange={setLocalPhone} />
            </div>
            <button onClick={savePersonal} disabled={saving || !localName.trim()}
              className="w-full py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Hospital Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100">
          <Building2 className="w-4 h-4 text-medical-600 shrink-0" />
          <p className="text-sm font-bold text-slate-800 flex-1">Hospital or Clinic</p>
          <button onClick={() => { setEditingHospital((v) => !v); setSaveError(""); }} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors">
            {editingHospital ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {editingHospital ? "Cancel" : "Edit"}
          </button>
        </div>
        {!editingHospital ? (
          <div className="px-4 py-3 text-xs text-slate-600">
            <span className="text-slate-400 w-16 inline-block">Hospital</span>{profile.hospitals.length > 0 ? profile.hospitals.join(", ") : "—"}
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3 space-y-3">
            <HospitalTagInput value={localHospitals} onChange={setLocalHospitals} />
            <button onClick={saveHospital} disabled={saving || localHospitals.length === 0}
              className="w-full py-2.5 rounded-xl bg-medical-600 hover:bg-medical-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Bank Section */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-slate-100">
          <CreditCard className="w-4 h-4 text-medical-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">Bank Details <span className="text-xs font-normal text-slate-400">(optional)</span></p>
            <p className="text-xs text-slate-400">For referral commission payments</p>
          </div>
          <button onClick={() => { setEditingBank((v) => !v); setSaveError(""); }} className="text-xs text-medical-600 hover:text-medical-800 font-semibold flex items-center gap-1 transition-colors shrink-0">
            {editingBank ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {editingBank ? "Cancel" : profile.bank_name ? "Edit" : "Add"}
          </button>
        </div>
        {!editingBank ? (
          <div className="px-4 py-3 text-xs text-slate-600 space-y-0.5">
            {profile.bank_name ? (
              <>
                <p><span className="text-slate-400 w-20 inline-block">Bank</span>{profile.bank_name}</p>
                <p><span className="text-slate-400 w-20 inline-block">Account</span>{profile.account_number}</p>
                <p><span className="text-slate-400 w-20 inline-block">Name</span>{profile.account_name}</p>
              </>
            ) : (
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-400 italic">No bank details added yet. Add them to receive commission payments.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 pb-4 pt-3 space-y-3">
            <BankAccountInput
              bankName={localBankName}
              bankCode={localBankCode}
              accountNumber={localAccountNumber}
              accountName={localAccountName}
              onBankChange={(name, code) => { setLocalBankName(name); setLocalBankCode(code); setBankVerified(false); }}
              onAccountNumberChange={(v) => { setLocalAccountNumber(v); setBankVerified(false); }}
              onAccountNameChange={setLocalAccountName}
              onVerifiedChange={setBankVerified}
            />
            <button onClick={saveBank} disabled={saving || !bankVerified}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Bank Details"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
