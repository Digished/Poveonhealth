"use client";

import { useState, useRef } from "react";
import toast from "react-hot-toast";
import { Save, Loader2, Building2, Shield, Check } from "lucide-react";
import { MEDICAL_SPECIALTIES } from "@/lib/specialties";
import { HospitalInfo } from "./types";

export function SettingsTab({
  hospital, onHospitalUpdate,
}: {
  hospital: HospitalInfo;
  onHospitalUpdate: (h: HospitalInfo) => void;
}) {
  const [phone, setPhone]     = useState(hospital.phone ?? "");
  const [address, setAddress] = useState(hospital.address ?? "");
  const [city, setCity]       = useState(hospital.city ?? "");
  const [stateVal, setStateVal] = useState(hospital.state ?? "");
  const [specialties, setSpecialties] = useState<string[]>(hospital.specialties ?? []);
  const [saving, setSaving] = useState(false);

  // Change PIN
  const [newPin, setNewPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [savingPin, setSavingPin] = useState(false);
  const newPinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  function toggleSpecialty(s: string) {
    setSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/hospital/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          state: stateVal.trim() || null,
          specialties,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save profile.");
        return;
      }
      toast.success("Hospital profile saved.");
      onHospitalUpdate({
        ...hospital,
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: stateVal.trim() || null,
        specialties,
      });
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handlePinDigit(
    values: string[],
    setValues: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
    i: number,
    raw: string,
  ) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setValues((prev) => { const next = [...prev]; next[i] = digit; return next; });
    if (digit && i < 3) refs.current[i + 1]?.focus();
  }

  async function handleChangePin(e: React.FormEvent) {
    e.preventDefault();
    const p1 = newPin.join("");
    const p2 = confirmPin.join("");
    if (p1.length !== 4) { toast.error("Please enter all 4 digits."); return; }
    if (p1 !== p2) { toast.error("PINs do not match."); return; }
    setSavingPin(true);
    try {
      const res = await fetch("/api/hospital-login/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: p1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update PIN.");
        return;
      }
      toast.success("PIN updated.");
      setNewPin(["", "", "", ""]);
      setConfirmPin(["", "", "", ""]);
      onHospitalUpdate({ ...hospital, has_pin: true });
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSavingPin(false);
    }
  }

  const inputCls = "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1";
  const pinBoxCls = "w-11 h-12 text-center text-lg font-bold text-slate-800 border-2 border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 transition";

  return (
    <div className="space-y-4">
      {/* Hospital profile */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5 space-y-4">
        <div>
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-medical-600" /> Hospital Profile
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {hospital.name} · {hospital.email}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+234 800 000 0000" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
              placeholder="City" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>State</label>
            <input type="text" value={stateVal} onChange={(e) => setStateVal(e.target.value)}
              placeholder="State" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Specialties <span className="text-slate-400 font-normal">({specialties.length} selected)</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">
            Doctors will only see your hospital as a referral option for the specialties you select.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MEDICAL_SPECIALTIES.map((s) => {
              const active = specialties.includes(s);
              return (
                <button key={s} type="button" onClick={() => toggleSpecialty(s)}
                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full border transition ${
                    active
                      ? "bg-medical-600 text-white border-medical-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-medical-300 hover:text-medical-600"
                  }`}>
                  {active && <Check className="w-3 h-3" />}
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition shadow-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </form>

      {/* Change PIN */}
      <form onSubmit={handleChangePin} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-5 space-y-4">
        <div>
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-4 h-4 text-medical-600" /> {hospital.has_pin ? "Change PIN" : "Set a PIN"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Your 4-digit PIN is used to sign in quickly without an email code.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-2">New PIN</p>
            <div className="flex gap-2">
              {newPin.map((digit, i) => (
                <input key={i}
                  ref={(el) => { newPinRefs.current[i] = el; }}
                  type="password" inputMode="numeric" maxLength={2} value={digit}
                  onChange={(e) => handlePinDigit(newPin, setNewPin, newPinRefs, i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Backspace" && !newPin[i] && i > 0) newPinRefs.current[i - 1]?.focus(); }}
                  className={pinBoxCls} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2">Confirm PIN</p>
            <div className="flex gap-2">
              {confirmPin.map((digit, i) => (
                <input key={i}
                  ref={(el) => { confirmPinRefs.current[i] = el; }}
                  type="password" inputMode="numeric" maxLength={2} value={digit}
                  onChange={(e) => handlePinDigit(confirmPin, setConfirmPin, confirmPinRefs, i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Backspace" && !confirmPin[i] && i > 0) confirmPinRefs.current[i - 1]?.focus(); }}
                  className={pinBoxCls} />
              ))}
            </div>
          </div>
        </div>

        <button type="submit" disabled={savingPin || newPin.join("").length !== 4 || confirmPin.join("").length !== 4}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition shadow-sm">
          {savingPin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
          Update PIN
        </button>
      </form>
    </div>
  );
}
