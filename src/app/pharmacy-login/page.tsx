"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Lock, Mail, Pill } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

type Stage = "email" | "pin" | "otp" | "create-pin";

/**
 * Partner pharmacies sign in with a 4-digit PIN. A code is emailed only the
 * first time, or when they've forgotten the PIN.
 */
export default function PharmacyLoginPage() {
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
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => { firstField.current?.focus(); }, [stage]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const done = () => router.replace("/pharmacy-dashboard");

  async function startWithEmail() {
    const value = email.trim().toLowerCase();
    if (busy || !value.includes("@")) return;
    setBusy(true);
    setError("");
    try {
      const check = await fetch("/api/pharmacy/check-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if ((await check.json())?.hasPin === true) { setStage("pin"); return; }
      await sendCode(value);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendCode(address = email.trim().toLowerCase()) {
    setError("");
    const res = await fetch("/api/pharmacy/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Could not send the code."); return; }
    setOtp("");
    setCountdown(60);
    setStage("otp");
  }

  async function signInWithPin() {
    if (busy || pin.length !== 4) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pharmacy/verify-pin", {
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
      const res = await fetch("/api/pharmacy/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error ?? "That code didn't work."); return; }
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
      const res = await fetch("/api/pharmacy/set-pin", {
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2">
          <PoveonLogo className="h-6 w-6 text-medical-600" />
          <span className="text-lg font-bold text-slate-900">Poveon Pharmacy</span>
        </Link>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl backdrop-blur sm:p-7">
          {stage === "email" && (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Pill className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-lg font-bold text-slate-900">Pharmacy sign in</h1>
              <p className="mt-1 text-sm text-slate-500">
                Enter your registered pharmacy email.
              </p>
              <input
                ref={firstField}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") startWithEmail(); }}
                placeholder="pharmacy@example.com"
                className={inputClass}
              />
              <Err error={error} />
              <Primary busy={busy} disabled={!email.includes("@")} onClick={startWithEmail}>
                Continue
              </Primary>
            </>
          )}

          {stage === "pin" && (
            <>
              <Back onClick={() => { setStage("email"); setPin(""); setError(""); }}>Use a different email</Back>
              <h1 className="mt-3 text-lg font-bold text-slate-900">Enter your PIN</h1>
              <p className="mt-1 text-sm text-slate-500">
                Signing in as <span className="font-semibold text-slate-700">{email.trim()}</span>.
              </p>
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
              <h1 className="mt-3 text-lg font-bold text-slate-900">Enter your code</h1>
              <p className="mt-1 text-sm text-slate-500">
                Sent to <span className="font-semibold text-slate-700">{email.trim()}</span>.
              </p>
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
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Lock className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-lg font-bold text-slate-900">Choose a PIN</h1>
              <p className="mt-1 text-sm text-slate-500">
                You&apos;ll use this to sign in from now on — no more emailed codes.
              </p>
              <input
                ref={firstField}
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className={pinClass}
              />
              <input
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") savePin(); }}
                placeholder="Confirm PIN"
                className={`${pinClass} mt-2`}
              />
              <Err error={error} />
              <Primary busy={busy} disabled={newPin.length !== 4 || confirmPin.length !== 4} onClick={savePin}>
                Save PIN &amp; sign in
              </Primary>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Want to join the network? Email partners@poveon.com
        </p>
      </div>
    </div>
  );
}

const inputClass =
  "mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";

const pinClass =
  "mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-slate-800 placeholder-slate-300 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";

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
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
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
  return <p className="mt-3 text-sm text-red-600">{error}</p>;
}
