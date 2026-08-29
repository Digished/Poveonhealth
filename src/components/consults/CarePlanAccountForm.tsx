"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";

type Stage = "email" | "pin" | "otp" | "create-pin";

/**
 * The one form on /consults: create (or sign in to) a Poveon account with an
 * email and a 4-digit PIN, then land on the dashboard with the care-plan form
 * open. The PIN means the next visit needs no emailed code.
 *
 * It runs on the patient portal's own auth, so anyone we already hold an email
 * for — from a lab request or a referral — signs straight in and keeps their
 * history.
 */
export function CarePlanAccountForm({ priceLabel }: { priceLabel: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [returning, setReturning] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => { firstField.current?.focus(); }, [stage]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const done = () => router.replace("/dashboard?care=1");

  /** Existing account with a PIN goes to the PIN box; anyone else gets a code. */
  async function startWithEmail() {
    const value = email.trim().toLowerCase();
    if (busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return;
    setBusy(true);
    setError("");
    try {
      const check = await fetch("/api/patient/check-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const hasPin = (await check.json())?.hasPin === true;
      setReturning(hasPin);
      if (hasPin) { setStage("pin"); return; }
      await sendCode(value);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(address = email.trim().toLowerCase()) {
    setError("");
    const res = await fetch("/api/patient/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Could not send your code."); return; }
    setOtp("");
    setCountdown(60);
    setStage("otp");
  }

  async function signInWithPin() {
    if (busy || pin.length !== 4) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/patient/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error ?? "Incorrect PIN."); return; }
      done();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (busy || otp.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/patient/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error ?? "That code didn't work."); return; }
      // A new account sets its PIN now, so this is the last code they ever need.
      if (data.should_create_pin) { setStage("create-pin"); return; }
      done();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function savePin() {
    if (busy) return;
    if (newPin.length !== 4) { setError("Your PIN must be 4 digits."); return; }
    if (newPin !== confirmPin) { setError("Those PINs don't match."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/patient/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error ?? "Could not save your PIN."); return; }
      done();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="join" className="w-full">
      <div className="overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl shadow-slate-900/10 ring-1 ring-medical-500/10">
        <div className="bg-gradient-to-br from-medical-600 to-medical-800 px-6 py-5 text-white">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Start here</p>
          <h2 className="mt-1 text-xl font-bold">
            {stage === "create-pin" ? "Choose your PIN" : returning ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-1 text-sm text-white/80">
            {stage === "create-pin"
              ? "You'll use this to sign in from now on — no emailed codes."
              : returning
              ? "Enter your PIN and we'll take you to your care plan."
              : `An email and a 4-digit PIN. Then join the care plan for ${priceLabel} a year.`}
          </p>
        </div>

        <div className="space-y-4 p-6">
          {stage === "email" && (
            <>
              <Labelled label="Email address" icon={<Mail className="h-4 w-4" />}>
                <input
                  ref={firstField}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") startWithEmail(); }}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </Labelled>
              <Err error={error} />
              <Primary busy={busy} disabled={!email.includes("@")} onClick={startWithEmail}>
                Continue
              </Primary>
              <p className="text-center text-xs text-slate-400">
                Already had a lab test with us? Use that same email and everything comes with you.
              </p>
            </>
          )}

          {stage === "pin" && (
            <>
              <Back onClick={() => { setStage("email"); setPin(""); setError(""); }}>Use a different email</Back>
              <Labelled label={`PIN for ${email.trim()}`} icon={<Lock className="h-4 w-4" />}>
                <input
                  ref={firstField}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") signInWithPin(); }}
                  placeholder="••••"
                  className={pinClass}
                />
              </Labelled>
              <Err error={error} />
              <Primary busy={busy} disabled={pin.length !== 4} onClick={signInWithPin}>
                Sign in
              </Primary>
              <button
                onClick={() => sendCode()}
                disabled={busy}
                className="w-full py-2 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
              >
                Forgot your PIN? Email me a code instead
              </button>
            </>
          )}

          {stage === "otp" && (
            <>
              <Back onClick={() => { setStage("email"); setOtp(""); setError(""); }}>Use a different email</Back>
              <Labelled label={`6-digit code sent to ${email.trim()}`} icon={<Mail className="h-4 w-4" />}>
                <input
                  ref={firstField}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") verifyCode(); }}
                  placeholder="000000"
                  className={pinClass}
                />
              </Labelled>
              <Err error={error} />
              <Primary busy={busy} disabled={otp.length !== 6} onClick={verifyCode}>
                Verify
              </Primary>
              <button
                onClick={() => sendCode()}
                disabled={busy || countdown > 0}
                className="w-full py-2 text-xs font-semibold text-slate-400 transition hover:text-slate-600 disabled:opacity-50"
              >
                {countdown > 0 ? `Send it again in ${countdown}s` : "Send it again"}
              </button>
            </>
          )}

          {stage === "create-pin" && (
            <>
              <Labelled label="New 4-digit PIN" icon={<Lock className="h-4 w-4" />}>
                <input
                  ref={firstField}
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className={pinClass}
                />
              </Labelled>
              <Labelled label="Confirm your PIN" icon={<Lock className="h-4 w-4" />}>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") savePin(); }}
                  placeholder="••••"
                  className={pinClass}
                />
              </Labelled>
              <Err error={error} />
              <Primary busy={busy} disabled={newPin.length !== 4 || confirmPin.length !== 4} onClick={savePin}>
                Save PIN &amp; continue
              </Primary>
            </>
          )}

          <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 pt-4 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Your details are private and never sold.
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 transition focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

const pinClass =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-slate-800 placeholder-slate-300 transition focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40";

function Labelled({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <span className="text-slate-400">{icon}</span>
        {label}
      </span>
      {children}
    </label>
  );
}

function Primary({
  busy, disabled, onClick, children,
}: {
  busy: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-medical-600/25 transition hover:bg-medical-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
      {children}
    </button>
  );
}

function Back({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function Err({ error }: { error: string }) {
  if (!error) return null;
  return <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>;
}
