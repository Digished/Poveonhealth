"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { Mail, KeyRound, ArrowRight, RefreshCw, ChevronLeft, Lock, ShieldCheck } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { useRouter } from "next/navigation";

type Stage = "email" | "pin" | "otp" | "create-pin";

// Defined at module level so React never remounts the inputs on re-render (which would lose focus).
function PinBoxes({
  values, setValues, refs, label,
}: {
  values: string[];
  setValues: React.Dispatch<React.SetStateAction<string[]>>;
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  label?: string;
}) {
  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setValues((prev) => { const next = [...prev]; next[i] = digit; return next; });
    if (digit && i < values.length - 1) refs.current[i + 1]?.focus();
  }
  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !values[i] && i > 0) refs.current[i - 1]?.focus();
  }
  return (
    <div>
      {label && <p className="text-xs text-slate-400 mb-3">{label}</p>}
      <div className="flex gap-3 justify-center">
        {values.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            type="password"
            inputMode="numeric"
            maxLength={2}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className="w-14 h-16 text-center text-2xl font-bold text-slate-800 border-2 border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 transition"
          />
        ))}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.373 0 0 12h4z" />
    </svg>
  );
}

function PatientLoginInner() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState(["", "", "", ""]);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPin, setNewPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [afterOtp, setAfterOtp] = useState<"dashboard" | "reset-pin">("dashboard");
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const newPinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleDigitChange(
    arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
    maxLen: number, index: number, value: string
  ) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...arr];
    next[index] = digit;
    setArr(next);
    if (digit && index < maxLen - 1) refs.current[index + 1]?.focus();
  }

  function handleDigitKeyDown(
    arr: string[], refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
    index: number, e: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (e.key === "Backspace" && !arr[index] && index > 0) refs.current[index - 1]?.focus();
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/patient/check-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.hasPin) {
        setStage("pin");
        setTimeout(() => pinRefs.current[0]?.focus(), 100);
      } else {
        await sendOtp();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp() {
    const res = await fetch("/api/patient/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to send code."); return; }
    setStage("otp");
    setCountdown(60);
    setOtp(["", "", "", "", "", ""]);
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  }

  async function handleResend() {
    if (countdown > 0) return;
    setError("");
    setLoading(true);
    try { await sendOtp(); } catch { setError("Network error."); } finally { setLoading(false); }
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = pin.join("");
    if (code.length !== 4) { setError("Please enter all 4 digits."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/patient/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), pin: code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Incorrect PIN."); return; }
      router.replace("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPin() {
    setError("");
    setLoading(true);
    try {
      setAfterOtp("reset-pin");
      await sendOtp();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/patient/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code."); return; }
      if (afterOtp === "reset-pin" || data.should_create_pin) {
        setNewPin(["", "", "", ""]);
        setConfirmPin(["", "", "", ""]);
        setStage("create-pin");
        setTimeout(() => newPinRefs.current[0]?.focus(), 100);
      } else {
        router.replace("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const p1 = newPin.join("");
    const p2 = confirmPin.join("");
    if (p1.length !== 4) { setError("Please enter all 4 digits for your PIN."); return; }
    if (p1 !== p2) { setError("PINs do not match. Please try again."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/patient/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: p1 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to set PIN."); return; }
      router.replace("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg mb-3 p-2.5">
            <PoveonLogo className="w-full h-full text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Patient Portal</h1>
          <p className="text-sm text-slate-500 mt-1">View your lab test requests and results</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-6">

          {/* ── Email stage ── */}
          {stage === "email" && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-medical-600" />
                  <label htmlFor="patient-email" className="text-sm font-semibold text-slate-700">Your Email Address</label>
                </div>
                <p className="text-xs text-slate-400 mb-3">Enter the email associated with your lab requests.</p>
                <input
                  id="patient-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition"
                />
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md">
                {loading ? <Spinner /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {/* ── PIN stage ── */}
          {stage === "pin" && (
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <button type="button" onClick={() => { setStage("email"); setPin(["", "", "", ""]); setError(""); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition mb-1">
                <ChevronLeft className="w-3 h-3" /> Change email
              </button>
              <div className="text-center">
                <Lock className="w-8 h-8 text-medical-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700 mb-1">Enter your 4-digit PIN</p>
                <p className="text-xs text-slate-400 mb-4">Signed in as <span className="font-semibold text-slate-600">{email}</span></p>
                <PinBoxes values={pin} setValues={setPin} refs={pinRefs} />
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading || pin.join("").length !== 4}
                className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md">
                {loading ? <Spinner /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
              </button>
              <div className="text-center">
                <button type="button" onClick={handleForgotPin} disabled={loading}
                  className="text-xs text-slate-400 hover:text-medical-600 transition underline underline-offset-2">
                  Forgot PIN? Use email code instead
                </button>
              </div>
            </form>
          )}

          {/* ── OTP stage ── */}
          {stage === "otp" && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <button type="button" onClick={() => { setStage("email"); setOtp(["", "", "", "", "", ""]); setError(""); setAfterOtp("dashboard"); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition mb-1">
                <ChevronLeft className="w-3 h-3" /> Change email
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="w-4 h-4 text-medical-600" />
                  <label className="text-sm font-semibold text-slate-700">Enter Login Code</label>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  We sent a 6-digit code to <span className="font-semibold text-slate-600">{email}</span>
                </p>
                <div className="flex gap-2 justify-center">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={digit}
                      onChange={(e) => handleDigitChange(otp, setOtp, otpRefs, 6, i, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(otp, otpRefs, i, e)}
                      className="w-11 h-14 text-center text-xl font-bold text-slate-800 border-2 border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 transition"
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading || otp.join("").length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md">
                {loading ? <Spinner /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
              </button>
              <div className="text-center">
                <button type="button" disabled={countdown > 0 || loading} onClick={handleResend}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition">
                  <RefreshCw className="w-3 h-3" />
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}

          {/* ── Create/Reset PIN stage ── */}
          {stage === "create-pin" && (
            <form onSubmit={handleCreatePin} className="space-y-5">
              <div className="text-center">
                <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">
                  {afterOtp === "reset-pin" ? "Reset your PIN" : "Create a 4-digit PIN"}
                </p>
                <p className="text-xs text-slate-400 mt-1">Use this PIN instead of a login code next time.</p>
              </div>
              <PinBoxes values={newPin} setValues={setNewPin} refs={newPinRefs} label="Choose your 4-digit PIN" />
              <PinBoxes values={confirmPin} setValues={setConfirmPin} refs={confirmPinRefs} label="Confirm your PIN" />
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
              <button type="submit" disabled={loading || newPin.join("").length !== 4 || confirmPin.join("").length !== 4}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md">
                {loading ? <Spinner /> : <>{afterOtp === "reset-pin" ? "Reset PIN & Sign In" : "Set PIN & Sign In"} <ArrowRight className="w-4 h-4" /></>}
              </button>
              <div className="text-center">
                <button type="button" onClick={() => router.replace("/dashboard")}
                  className="text-xs text-slate-400 hover:text-slate-600 transition underline underline-offset-2">
                  Skip for now
                </button>
              </div>
            </form>
          )}

        </div>

        <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1.5">
          <PoveonLogo className="w-4 h-4 opacity-40" />
          Powered by Poveon
        </p>
      </div>
    </div>
  );
}

export default function PatientLoginPage() {
  return (
    <Suspense>
      <PatientLoginInner />
    </Suspense>
  );
}
