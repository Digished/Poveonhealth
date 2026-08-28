"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Mail } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

/** Care-plan members sign in with a code emailed to them — no password. */
export default function ConsultsLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/consults/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send the code.");
        return;
      }
      setStage("code");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/consults/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "That code didn't work.");
        return;
      }
      router.replace("/consults/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50/60 px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/consults" className="mb-6 flex items-center justify-center gap-2">
          <PoveonLogo className="h-6 w-6 text-medical-600" />
          <span className="text-lg font-bold text-slate-900">Poveon Care Plan</span>
        </Link>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl backdrop-blur sm:p-7">
          {stage === "email" ? (
            <>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-medical-50 text-medical-600">
                <Mail className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-lg font-bold text-slate-900">Sign in to your care plan</h1>
              <p className="mt-1 text-sm text-slate-500">
                Enter the email you joined with and we&apos;ll send you a 6-digit code.
              </p>
              <input
                autoFocus
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendCode(); }}
                placeholder="you@example.com"
                className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40"
              />
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <button
                onClick={sendCode}
                disabled={busy || !email.includes("@")}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-3 text-sm font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {busy ? "Sending…" : "Send my code"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStage("email"); setCode(""); setError(""); }}
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Use a different email
              </button>
              <h1 className="text-lg font-bold text-slate-900">Enter your code</h1>
              <p className="mt-1 text-sm text-slate-500">
                We sent a 6-digit code to <span className="font-semibold text-slate-700">{email}</span>.
              </p>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
                placeholder="000000"
                className="mt-5 w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-slate-800 focus:border-medical-400 focus:outline-none focus:ring-2 focus:ring-medical-400/40"
              />
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <button
                onClick={verify}
                disabled={busy || code.length < 6}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-medical-600 py-3 text-sm font-bold text-white transition hover:bg-medical-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {busy ? "Checking…" : "Sign in"}
              </button>
              <button
                onClick={sendCode}
                disabled={busy}
                className="mt-2 w-full py-2 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
              >
                Send it again
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Not a member yet?{" "}
          <Link href="/consults" className="font-semibold text-medical-600 hover:underline">
            See what the plan covers
          </Link>
        </p>
      </div>
    </div>
  );
}
