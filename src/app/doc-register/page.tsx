"use client";

import { useState, useRef, useEffect } from "react";
import {
  User, Mail, ArrowRight, ChevronLeft,
  ShieldCheck, Check, Eye, EyeOff,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { HospitalTagInput } from "@/components/ui/HospitalTagInput";
import { PrefixSelectInput } from "@/components/ui/PrefixSelectInput";
import { useRouter } from "next/navigation";

function PinBoxes({
  values, setValues, refs, show,
}: {
  values: string[];
  setValues: React.Dispatch<React.SetStateAction<string[]>>;
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  show: boolean;
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
    <div className="flex gap-3 justify-center">
      {values.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type={show ? "text" : "password"}
          inputMode="numeric"
          maxLength={2}
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-14 h-16 text-center text-2xl font-bold text-slate-800 border-2 border-slate-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-medical-400 transition"
        />
      ))}
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

export default function DocRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [email, setEmail] = useState("");
  const [prefix, setPrefix] = useState("");
  const [fullName, setFullName] = useState("");
  const [hospitals, setHospitals] = useState<string[]>([]); // list of selected hospital names

  // Step 2 PIN fields
  const [pin, setPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => pinRefs.current[0]?.focus(), 120);
    }
  }, [step]);

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Please enter a valid email address."); return; }
    if (!fullName.trim()) { setError("Please enter your full name."); return; }
    setStep(2);
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const p1 = pin.join("");
    const p2 = confirmPin.join("");
    if (p1.length !== 4) { setError("Please enter all 4 digits for your PIN."); return; }
    if (p1 !== p2) { setError("PINs do not match. Please try again."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/doc-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          prefix: prefix || null,
          full_name: fullName.trim(),
          hospitals: hospitals,
          pin: p1,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Registration failed."); return; }
      router.replace("/doc-login/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const step1Done = !!email.trim() && !!fullName.trim();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg mb-3 p-2.5">
            <PoveonLogo className="w-full h-full text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Create your account</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">Join Poveon to track your referrals and earnings</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center mb-6">
          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              step > 1 ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-medical-400 text-medical-600"
            }`}>
              {step > 1 ? <Check className="w-3.5 h-3.5" /> : "1"}
            </div>
            <span className={`text-xs font-medium ${step >= 1 ? "text-slate-700" : "text-slate-400"}`}>Your details</span>
          </div>

          <div className={`flex-1 h-px mx-3 transition-colors ${step > 1 ? "bg-emerald-400" : "bg-slate-200"}`} />

          <div className="flex items-center gap-2 shrink-0">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              step === 2 ? "bg-white border-medical-400 text-medical-600" : "bg-white border-slate-200 text-slate-400"
            }`}>
              2
            </div>
            <span className={`text-xs font-medium ${step === 2 ? "text-slate-700" : "text-slate-400"}`}>Create PIN</span>
          </div>
        </div>

        <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-6">

          {/* ── Step 1: Details ── */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your information</p>

              <div className="space-y-3">
                {/* Email */}
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition"
                  />
                </div>

                {/* Prefix + Name */}
                <div className="flex gap-2">
                  <PrefixSelectInput value={prefix} onChange={setPrefix} />
                  <div className="relative flex-1">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {/* Hospital */}
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Hospital / clinic <span className="text-slate-400">(optional)</span></label>
                  <HospitalTagInput
                    value={hospitals}
                    onChange={setHospitals}
                  />
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={!step1Done}
                className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-40 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-center text-xs text-slate-400 pt-1">
                Already have an account?{" "}
                <a href="/doc-login" className="text-medical-600 font-semibold hover:underline">Sign in</a>
              </p>
            </form>
          )}

          {/* ── Step 2: Create PIN ── */}
          {step === 2 && (
            <form onSubmit={handleStep2} className="space-y-6">
              <div className="text-center">
                <ShieldCheck className="w-9 h-9 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">Create your 4-digit PIN</p>
                <p className="text-xs text-slate-400 mt-1">
                  You&rsquo;ll use this to sign in quickly next time.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs text-center text-slate-500 font-medium">Choose a PIN</p>
                  <PinBoxes values={pin} setValues={setPin} refs={pinRefs} show={showPin} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-center text-slate-500 font-medium">Confirm PIN</p>
                  <PinBoxes values={confirmPin} setValues={setConfirmPin} refs={confirmPinRefs} show={showPin} />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="flex items-center gap-1.5 mx-auto text-xs text-slate-400 hover:text-slate-600 transition"
                >
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showPin ? "Hide" : "Show"} digits
                </button>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || pin.join("").length !== 4 || confirmPin.join("").length !== 4}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md"
              >
                {loading ? <Spinner /> : <>Create account <ArrowRight className="w-4 h-4" /></>}
              </button>

              <button
                type="button"
                onClick={() => { setStep(1); setError(""); }}
                className="flex items-center gap-1.5 mx-auto text-xs text-slate-400 hover:text-slate-600 transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back to details
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
