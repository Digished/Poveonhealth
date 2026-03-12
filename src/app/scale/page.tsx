"use client";

import { useState, useRef, useEffect } from "react";
import { TrendingUp, Mail, KeyRound, ArrowRight, RefreshCw, ChevronLeft } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { useRouter } from "next/navigation";

type Stage = "email" | "otp";

export default function ScaleLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
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

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/scale/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to send code."); return; }
      setStage("otp");
      setCountdown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    setError("");
    setOtp(["", "", "", "", "", ""]);
    setLoading(true);
    try {
      const res = await fetch("/api/scale/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to resend code."); return; }
      setCountdown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      const next = pasted.split("");
      setOtp(next);
      setTimeout(() => otpRefs.current[5]?.focus(), 0);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/scale/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code."); return; }
      router.replace("/scale/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 flex items-center justify-center shadow-lg mb-3">
            <TrendingUp className="w-6 h-6 text-emerald-200" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Marketer Portal</h1>
          <p className="text-sm text-slate-500 mt-1">View your referred doctors and their test activity</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-6">
          {stage === "email" ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-emerald-600" />
                  <label htmlFor="scale-email" className="text-sm font-semibold text-slate-700">
                    Your Email Address
                  </label>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Enter your registered marketer email. We&apos;ll send a login code.
                </p>
                <input
                  id="scale-email"
                  type="email"
                  autoComplete="email"
                  placeholder="marketer@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.373 0 0 12h4z" />
                  </svg>
                ) : (
                  <>Send Login Code <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <button
                type="button"
                onClick={() => { setStage("email"); setOtp(["", "", "", "", "", ""]); setError(""); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition mb-1"
              >
                <ChevronLeft className="w-3 h-3" /> Change email
              </button>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <KeyRound className="w-4 h-4 text-emerald-600" />
                  <label className="text-sm font-semibold text-slate-700">Enter Login Code</label>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  We sent a 6-digit code to <span className="font-semibold text-slate-600">{email}</span>
                </p>

                <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-11 h-14 text-center text-xl font-bold text-slate-800 border-2 border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
                    />
                  ))}
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || otp.join("").length !== 6}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md"
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.373 0 0 12h4z" />
                  </svg>
                ) : (
                  <>Sign In <ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  disabled={countdown > 0 || loading}
                  onClick={handleResend}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
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
