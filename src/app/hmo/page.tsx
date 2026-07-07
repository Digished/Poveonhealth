"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { Mail, KeyRound, ArrowRight, RefreshCw, ChevronLeft, HeartPulse, CreditCard } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { useRouter } from "next/navigation";

type Stage = "credentials" | "otp";

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.373 0 0 12h4z" />
    </svg>
  );
}

function HmoLoginInner() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  }

  async function sendOtp() {
    const res = await fetch("/api/hmo/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), policy_number: policyNumber.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to send code.");
      return;
    }
    setStage("otp");
    setCountdown(60);
    setOtp(["", "", "", "", "", ""]);
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  }

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!policyNumber.trim()) { setError("Please enter your policy number."); return; }
    setLoading(true);
    try {
      await sendOtp();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    setError("");
    setLoading(true);
    try { await sendOtp(); } catch { setError("Network error."); } finally { setLoading(false); }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/hmo/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), policy_number: policyNumber.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code."); return; }
      router.replace("/hmo/dashboard");
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
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-medical-600" /> Health Monitoring
          </h1>
          <p className="text-sm text-slate-500 mt-1">Log your blood pressure and blood sugar</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-6">

          {/* ── Email + policy number stage ── */}
          {stage === "credentials" && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-medical-600" />
                  <label htmlFor="hmo-email" className="text-sm font-semibold text-slate-700">Your Email Address</label>
                </div>
                <p className="text-xs text-slate-400 mb-3">The email registered with your HMO.</p>
                <input
                  id="hmo-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-4 h-4 text-medical-600" />
                  <label htmlFor="hmo-policy" className="text-sm font-semibold text-slate-700">Policy Number</label>
                </div>
                <p className="text-xs text-slate-400 mb-3">Found on your HMO membership card.</p>
                <input
                  id="hmo-policy"
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. POL-123456"
                  value={policyNumber}
                  onChange={(e) => { setPolicyNumber(e.target.value); setError(""); }}
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

          {/* ── OTP stage ── */}
          {stage === "otp" && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <button type="button" onClick={() => { setStage("credentials"); setOtp(["", "", "", "", "", ""]); setError(""); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition mb-1">
                <ChevronLeft className="w-3 h-3" /> Change details
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="w-4 h-4 text-medical-600" />
                  <label className="text-sm font-semibold text-slate-700">Enter Login Code</label>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  If your details match our records, a 6-digit code was sent to <span className="font-semibold text-slate-600">{email}</span>
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
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(i, e)}
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

        </div>

        <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1.5">
          <PoveonLogo className="w-4 h-4 opacity-40" />
          Powered by Poveon
        </p>
      </div>
    </div>
  );
}

export default function HmoLoginPage() {
  return (
    <Suspense>
      <HmoLoginInner />
    </Suspense>
  );
}
