"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Stethoscope, ArrowRight, ArrowLeft } from "lucide-react";

type Stage = "identify" | "pin";

export default function EmrLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("identify");
  const [hospitalEmail, setHospitalEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [staffName, setStaffName] = useState("");
  const [busy, setBusy] = useState(false);

  async function identify() {
    if (!hospitalEmail.trim() || !identifier.trim()) return toast.error("Enter the hospital email and your email/phone.");
    setBusy(true);
    try {
      const res = await fetch("/api/emr-login/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital_email: hospitalEmail, identifier }),
      });
      const data = await res.json();
      if (!res.ok || !data.exists) { toast.error(data.error ?? "Account not found."); return; }
      if (!data.has_pin) { toast.error("No PIN set yet. Ask your admin to set your login PIN."); return; }
      setStaffName(data.staff_name ?? "");
      setStage("pin");
    } catch {
      toast.error("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (!/^\d{4}$/.test(pin)) return toast.error("Enter your 4-digit PIN.");
    setBusy(true);
    try {
      const res = await fetch("/api/emr-login/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital_email: hospitalEmail, identifier, pin }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Sign-in failed."); return; }
      toast.success(`Welcome, ${data.staff_name ?? "back"}`);
      router.replace("/emr");
    } catch {
      toast.error("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-medical-400 focus:ring-2 focus:ring-medical-500/30 outline-none transition";

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-medical-600 to-medical-800 flex items-center justify-center shadow-md mb-3">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Staff sign-in</h1>
          <p className="text-xs text-slate-500">Hospital EMR workspace</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          {stage === "identify" && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500">Hospital email</label>
                <input className={inputCls} placeholder="hospital@example.com" value={hospitalEmail} onChange={(e) => setHospitalEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Your email or phone</label>
                <input className={inputCls} placeholder="you@example.com" value={identifier} onChange={(e) => setIdentifier(e.target.value)} onKeyDown={(e) => e.key === "Enter" && identify()} />
              </div>
              <button onClick={identify} disabled={busy} className="w-full bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {stage === "pin" && (
            <>
              <p className="text-sm text-slate-600">Hi <span className="font-semibold">{staffName}</span>, enter your PIN.</p>
              <input
                autoFocus inputMode="numeric" maxLength={4}
                className={`${inputCls} text-center text-2xl tracking-[0.5em] font-bold`}
                placeholder="••••" value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && signIn()}
              />
              <button onClick={signIn} disabled={busy} className="w-full bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3 text-sm transition">
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <button onClick={() => { setStage("identify"); setPin(""); }} className="w-full text-slate-400 hover:text-slate-600 text-xs flex items-center justify-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
