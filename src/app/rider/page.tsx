"use client";

import { useState, useEffect, useCallback } from "react";
import { toast, Toaster } from "react-hot-toast";
import {
  Mail, KeyRound, ArrowRight, RefreshCw, ChevronLeft, LogOut, Bike,
  MapPin, Phone, User, Check,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

type Stage = "email" | "otp" | "dashboard";

interface Ride {
  id: string;
  status: string;
  patient_first_name: string;
  patient_phone: string;
  pickup_address: string;
  destination_lab: string;
  destination_address: string;
  completed_at: string | null;
}

export default function RiderPage() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [booting, setBooting] = useState(true);
  const [rides, setRides] = useState<Ride[]>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const boot = useCallback(async () => {
    const res = await fetch("/api/rider/rides");
    if (res.ok) {
      const data = await res.json();
      setRides(data.rides ?? []);
      setStage("dashboard");
    }
    setBooting(false);
  }, []);
  useEffect(() => { boot(); }, [boot]);

  async function refresh() {
    const res = await fetch("/api/rider/rides");
    if (res.ok) { const data = await res.json(); setRides(data.rides ?? []); }
  }

  async function sendOtp() {
    const res = await fetch("/api/rider-login/send-otp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed to send code."); return false; }
    setStage("otp"); setCountdown(60); setOtp("");
    return true;
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!email.trim()) { setError("Enter your email address."); return; }
    setLoading(true);
    try { await sendOtp(); } catch { setError("Network error."); } finally { setLoading(false); }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (otp.length !== 6) { setError("Enter the 6-digit code."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/rider-login/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code."); return; }
      await refresh(); setStage("dashboard");
    } catch { setError("Network error."); } finally { setLoading(false); }
  }

  async function logout() {
    await fetch("/api/rider-login/logout", { method: "POST" }).catch(() => {});
    setStage("email"); setEmail(""); setOtp(""); setRides([]);
  }

  const inputCls = "w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition";

  if (booting) {
    return <div className="min-h-dvh flex items-center justify-center bg-slate-50"><RefreshCw className="w-6 h-6 text-medical-400 animate-spin" /></div>;
  }

  if (stage !== "dashboard") {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center px-4 py-12">
        <Toaster position="top-center" />
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg mb-3">
              <Bike className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">Rider App</h1>
            <p className="text-sm text-slate-500 mt-1 text-center">Your assigned rides and trip completion</p>
          </div>
          <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-6">
            {stage === "email" && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4 text-medical-600" />
                    <label className="text-sm font-semibold text-slate-700">Your Email</label>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Use the email your company added you with.</p>
                  <input type="email" autoComplete="email" placeholder="rider@email.com"
                    value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} className={inputCls} />
                </div>
                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md">
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}
            {stage === "otp" && (
              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <button type="button" onClick={() => { setStage("email"); setError(""); }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition mb-1">
                  <ChevronLeft className="w-3 h-3" /> Change email
                </button>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="w-4 h-4 text-medical-600" />
                    <label className="text-sm font-semibold text-slate-700">Enter Login Code</label>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">We sent a 6-digit code to <span className="font-semibold text-slate-600">{email}</span></p>
                  <input inputMode="numeric" maxLength={6} placeholder="000000" value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                    className={`${inputCls} text-center text-2xl tracking-[0.5em] font-bold`} />
                </div>
                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading || otp.length !== 6}
                  className="w-full flex items-center justify-center gap-2 bg-medical-600 hover:bg-medical-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-3 rounded-xl transition shadow-md">
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Verify <ArrowRight className="w-4 h-4" /></>}
                </button>
                <div className="text-center">
                  <button type="button" disabled={countdown > 0 || loading}
                    onClick={async () => { setLoading(true); await sendOtp().catch(() => {}); setLoading(false); }}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50 transition">
                    <RefreshCw className="w-3 h-3" />{countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                  </button>
                </div>
              </form>
            )}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1.5">
            <PoveonLogo className="w-4 h-4 opacity-40" /> Powered by Poveon
          </p>
        </div>
      </div>
    );
  }

  const activeRides = rides.filter((r) => r.status === "assigned");
  const doneRides = rides.filter((r) => r.status === "completed");

  return (
    <div className="min-h-dvh bg-slate-50">
      <Toaster position="top-center" />
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Bike className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold">Your rides</p>
              <p className="text-[11px] text-slate-400">{activeRides.length} active</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={refresh} className="text-slate-300 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={logout} className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-4 space-y-3">
        {activeRides.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-10">No active rides right now.</p>
        )}
        {activeRides.map((ride) => (
          <RiderCard key={ride.id} ride={ride} onCompleted={refresh} />
        ))}

        {doneRides.length > 0 && (
          <div className="pt-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Completed · {doneRides.length}</p>
            <div className="space-y-2">
              {doneRides.map((ride) => (
                <div key={ride.id} className="bg-white rounded-2xl border border-slate-200 p-3 flex items-center gap-3 opacity-70">
                  <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{ride.patient_first_name} → {ride.destination_lab}</p>
                    <p className="text-xs text-slate-400 truncate">{ride.pickup_address}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RiderCard({ ride, onCompleted }: { ride: Ride; onCompleted: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function complete() {
    if (!code.trim()) { toast.error("Ask the patient for their arrival code."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/rider/rides/${ride.id}/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Failed to complete ride."); return; }
      toast.success("Ride completed 🎉");
      onCompleted();
    } catch { toast.error("Network error."); } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-medical-100 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-medical-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{ride.patient_first_name}</p>
          <a href={`tel:${ride.patient_phone}`} className="text-xs text-medical-600 font-mono flex items-center gap-1">
            <Phone className="w-3 h-3" /> {ride.patient_phone}
          </a>
        </div>
      </div>

      <div className="space-y-1.5 text-sm mb-3">
        <p className="flex items-start gap-2 text-slate-600">
          <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span><span className="text-[11px] uppercase text-slate-400 font-semibold">Pickup</span><br />{ride.pickup_address}</span>
        </p>
        <p className="flex items-start gap-2 text-slate-600">
          <MapPin className="w-4 h-4 text-medical-500 shrink-0 mt-0.5" />
          <span><span className="text-[11px] uppercase text-slate-400 font-semibold">Drop-off</span><br />{ride.destination_lab}</span>
        </p>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 mb-3">
        <p className="text-[11px] text-amber-700 leading-snug">
          Ask for the arrival code <strong>only after reaching the lab</strong>. Enter it to end the trip.
        </p>
      </div>

      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Arrival code"
          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-medical-400" />
        <button disabled={busy} onClick={complete}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center gap-1.5">
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> End</>}
        </button>
      </div>
    </div>
  );
}
