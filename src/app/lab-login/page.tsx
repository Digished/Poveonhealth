"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Mail, Lock, Eye, EyeOff, ArrowLeft, KeyRound, ArrowRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "react-hot-toast";
import Link from "next/link";

type Stage = "login" | "forgot-email" | "forgot-otp" | "forgot-password";

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 5.373 0 0 12h4z" />
    </svg>
  );
}

// Module-level so React doesn't unmount/remount on each parent render
function OtpInputs({
  values, setValues, refs,
}: {
  values: string[];
  setValues: (v: string[]) => void;
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
}) {
  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...values]; next[i] = digit;
    setValues(next);
    if (digit && i < values.length - 1) refs.current[i + 1]?.focus();
  }
  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !values[i] && i > 0) refs.current[i - 1]?.focus();
  }
  return (
    <div className="flex gap-2 justify-center">
      {values.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="tel"
          inputMode="numeric"
          maxLength={2}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          style={{ height: "52px" }}
          className="w-11 text-center text-xl font-bold text-white border border-white/20 rounded-xl bg-white/10 focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent transition-all"
        />
      ))}
    </div>
  );
}

export default function LabLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("login");
  // Login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Forgot-password fields
  const [forgotEmail, setForgotEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [countdown, setCountdown] = useState(0);
  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError("Please enter your email and password"); return; }
    setLoading(true); setError("");
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) { setLoading(false); setError("Invalid email or password"); return; }
    const role = data.user?.user_metadata?.role;
    if (role !== "lab" && role !== "lab_member") {
      await supabase.auth.signOut();
      setLoading(false); setError("This login is for laboratory accounts only"); return;
    }
    fetch("/api/lab/log-activity", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", detail: "Signed in to lab dashboard" }),
    }).catch(() => null);
    toast.success("Welcome back!");
    router.push("/lab-dashboard"); router.refresh();
  }

  async function sendOtp(targetEmail: string) {
    const res = await fetch("/api/lab/send-otp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetEmail.trim(), purpose: "reset" }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to send code"); }
    setOtp(["", "", "", "", "", ""]); setCountdown(60);
    let c = 60; const t = setInterval(() => { c--; setCountdown(c); if (c <= 0) clearInterval(t); }, 1000);
    setTimeout(() => otpRefs.current[0]?.focus(), 100);
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!forgotEmail.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    try { await sendOtp(forgotEmail); setStage("forgot-otp"); }
    catch (err) { setError(err instanceof Error ? err.message : "Network error."); }
    finally { setLoading(false); }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const code = otp.join("");
    if (code.length !== 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/lab/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim(), code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid or expired code."); return; }
      setNewPassword(""); setConfirmPassword(""); setStage("forgot-password");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      // Send OTP + new password together to set-password endpoint
      // We already verified identity via OTP — now we call an endpoint to update the password
      const res = await fetch("/api/lab/set-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim(), password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to update password."); return; }
      toast.success("Password updated! Please sign in.");
      setStage("login"); setEmail(forgotEmail); setForgotEmail(""); setPassword("");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-medical-950 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-medical-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-slide-up">
        <Link href="/" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />Back to Home
        </Link>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">

          {/* ── Login ── */}
          {stage === "login" && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-medical-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <FlaskConical className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-1">Lab Login</h1>
                <p className="text-slate-400 text-sm">Sign in to your laboratory dashboard</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />Email Address
                  </label>
                  <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    placeholder="lab@hospital.com" autoComplete="email" required
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />Password
                  </label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                      placeholder="••••••••" autoComplete="current-password" required
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent transition-all" />
                    <button type="button" onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" size="lg" loading={loading} className="mt-2">Sign In to Dashboard</Button>
              </form>
              <p className="text-center text-xs text-slate-500 mt-6">
                Forgot your password?{" "}
                <button type="button"
                  onClick={() => { setForgotEmail(email); setError(""); setStage("forgot-email"); }}
                  className="text-medical-400 hover:text-medical-300 transition-colors underline underline-offset-2">
                  Reset it
                </button>
              </p>
            </>
          )}

          {/* ── Forgot: enter email ── */}
          {stage === "forgot-email" && (
            <>
              <button type="button" onClick={() => { setStage("login"); setError(""); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition mb-5">
                <ChevronLeft className="w-3.5 h-3.5" />Back to login
              </button>
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-6 h-6 text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Reset Password</h2>
                <p className="text-slate-400 text-sm">Enter your lab account email to receive a verification code</p>
              </div>
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
                <input type="email" value={forgotEmail} onChange={(e) => { setForgotEmail(e.target.value); setError(""); }}
                  placeholder="lab@hospital.com" autoComplete="email" required
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent transition-all" />
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition">
                  {loading ? <Spinner /> : <>Send Verification Code <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          )}

          {/* ── Forgot: enter OTP ── */}
          {stage === "forgot-otp" && (
            <>
              <button type="button" onClick={() => { setStage("forgot-email"); setError(""); }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition mb-5">
                <ChevronLeft className="w-3.5 h-3.5" />Back
              </button>
              <div className="text-center mb-6">
                <KeyRound className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <h2 className="text-lg font-bold text-white mb-1">Enter Verification Code</h2>
                <p className="text-xs text-slate-400">
                  Sent to <span className="font-semibold text-slate-200">{forgotEmail}</span>. Expires in 10 minutes.
                </p>
              </div>
              <form onSubmit={handleOtpSubmit} className="space-y-4">
                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
                <OtpInputs values={otp} setValues={setOtp} refs={otpRefs} />
                <button type="submit" disabled={loading || otp.join("").length !== 6}
                  className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition">
                  {loading ? <Spinner /> : <>Verify Code <ArrowRight className="w-4 h-4" /></>}
                </button>
                <p className="text-center text-xs text-slate-500">
                  {countdown > 0
                    ? `Resend in ${countdown}s`
                    : <button type="button" onClick={async () => {
                        setLoading(true);
                        try { await sendOtp(forgotEmail); } catch { /* */ } finally { setLoading(false); }
                      }} disabled={loading} className="text-medical-400 hover:text-medical-300 transition underline underline-offset-2">
                        Resend code
                      </button>
                  }
                </p>
              </form>
            </>
          )}

          {/* ── Forgot: set new password ── */}
          {stage === "forgot-password" && (
            <>
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Lock className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Set New Password</h2>
                <p className="text-slate-400 text-sm">Identity verified. Choose a strong new password.</p>
              </div>
              <form onSubmit={handleNewPassword} className="space-y-4">
                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">New Password</label>
                  <div className="relative">
                    <input type={showNew ? "text" : "password"} value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent" />
                    <button type="button" onClick={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Confirm New Password</label>
                  <div className="relative">
                    <input type={showConfirm ? "text" : "password"} value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password"
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 pr-10 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 focus:border-transparent" />
                    <button type="button" onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition">
                  {loading ? <Spinner /> : "Update Password"}
                </button>
              </form>
            </>
          )}

        </div>
        <p className="text-center text-xs text-slate-600 mt-4">This portal is for registered laboratories only.</p>
      </div>
    </div>
  );
}
