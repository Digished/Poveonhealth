"use client";

import { useState, useEffect, useCallback } from "react";
import { toast, Toaster } from "react-hot-toast";
import {
  Mail, KeyRound, ArrowRight, RefreshCw, ChevronLeft, LogOut, Truck,
  MapPin, Phone, User, Plus, Check, X, Users, Package,
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
  rider_id: string | null;
  rider_name: string | null;
  redeem_by: string;
  created_at: string;
  completed_at: string | null;
}
interface RiderLite { id: string; name: string; phone: string }
interface Partner { id: string; name: string; email: string }

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  assigned: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function LogisticsPage() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [booting, setBooting] = useState(true);

  const [partner, setPartner] = useState<Partner | null>(null);
  const [labs, setLabs] = useState<{ id: string; name: string }[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [riders, setRiders] = useState<RiderLite[]>([]);
  const [tab, setTab] = useState<"rides" | "riders">("rides");

  // Add-rider form
  const [showAddRider, setShowAddRider] = useState(false);
  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPhone, setRPhone] = useState("");

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const loadDashboard = useCallback(async () => {
    const me = await fetch("/api/logistics/me");
    if (!me.ok) { setBooting(false); return; }
    const meData = await me.json();
    setPartner(meData.partner);
    setLabs(meData.labs ?? []);
    setStage("dashboard");
    await refreshRides();
    setBooting(false);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  async function refreshRides() {
    const res = await fetch("/api/logistics/rides");
    if (!res.ok) return;
    const data = await res.json();
    setRides(data.rides ?? []);
    setRiders(data.riders ?? []);
  }

  async function sendOtp() {
    const res = await fetch("/api/logistics-login/send-otp", {
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
      const res = await fetch("/api/logistics-login/verify-otp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: otp }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Invalid code."); return; }
      await loadDashboard();
    } catch { setError("Network error."); } finally { setLoading(false); }
  }

  async function logout() {
    await fetch("/api/logistics-login/logout", { method: "POST" }).catch(() => {});
    setPartner(null); setStage("email"); setEmail(""); setOtp("");
  }

  async function assignRider(rideId: string, riderId: string) {
    const res = await fetch(`/api/logistics/rides/${rideId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", rider_id: riderId }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Failed to assign rider."); return; }
    toast.success("Rider assigned — patient notified.");
    refreshRides();
  }

  async function cancelRide(rideId: string) {
    const res = await fetch(`/api/logistics/rides/${rideId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (!res.ok) { toast.error("Failed to cancel."); return; }
    toast.success("Ride cancelled.");
    refreshRides();
  }

  async function addRider(e: React.FormEvent) {
    e.preventDefault();
    if (!rName.trim() || !rEmail.trim() || !rPhone.trim()) { toast.error("Fill all fields."); return; }
    const res = await fetch("/api/logistics/riders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: rName.trim(), email: rEmail.trim(), phone: rPhone.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Failed to add rider."); return; }
    toast.success("Rider added.");
    setRName(""); setREmail(""); setRPhone(""); setShowAddRider(false);
    refreshRides();
  }

  const inputCls = "w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-medical-400 focus:border-transparent transition";

  if (booting) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <RefreshCw className="w-6 h-6 text-medical-400 animate-spin" />
      </div>
    );
  }

  // ── Login ──
  if (stage !== "dashboard") {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 flex flex-col items-center justify-center px-4 py-12">
        <Toaster position="top-center" />
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg mb-3">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">Logistics Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1 text-center">Manage patient rides for your assigned labs</p>
          </div>

          <div className="bg-white/80 backdrop-blur-sm border border-white/60 rounded-3xl shadow-xl p-6">
            {stage === "email" && (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4 text-medical-600" />
                    <label className="text-sm font-semibold text-slate-700">Company Email</label>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">Use the email your account was created with.</p>
                  <input type="email" autoComplete="email" placeholder="dispatch@company.com"
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

  // ── Dashboard ──
  const pending = rides.filter((r) => r.status === "pending");
  const active = rides.filter((r) => r.status === "assigned");
  const done = rides.filter((r) => r.status === "completed" || r.status === "cancelled");

  return (
    <div className="min-h-dvh bg-slate-50">
      <Toaster position="top-center" />
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{partner?.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{labs.length} lab{labs.length === 1 ? "" : "s"} assigned</p>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition">
            <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab("rides")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${tab === "rides" ? "bg-medical-600 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
            <Package className="w-4 h-4" /> Rides
          </button>
          <button onClick={() => setTab("riders")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition ${tab === "riders" ? "bg-medical-600 text-white" : "bg-white text-slate-500 border border-slate-200"}`}>
            <Users className="w-4 h-4" /> Riders
          </button>
          <button onClick={refreshRides} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-full text-sm text-slate-500 bg-white border border-slate-200 hover:text-slate-700">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {tab === "rides" && (
          <div className="space-y-5">
            <RideGroup title="Pending" rides={pending} riders={riders} onAssign={assignRider} onCancel={cancelRide} emptyLabel="No pending rides." />
            <RideGroup title="Assigned" rides={active} riders={riders} onAssign={assignRider} onCancel={cancelRide} emptyLabel="No active rides." />
            {done.length > 0 && <RideGroup title="History" rides={done} riders={riders} onAssign={assignRider} onCancel={cancelRide} emptyLabel="" history />}
          </div>
        )}

        {tab === "riders" && (
          <div className="space-y-3">
            <button onClick={() => setShowAddRider((v) => !v)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-medical-600 text-white text-sm font-semibold shadow-sm hover:bg-medical-700 transition">
              <Plus className="w-4 h-4" /> Add rider
            </button>
            {showAddRider && (
              <form onSubmit={addRider} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-sm">
                <input placeholder="Rider name" value={rName} onChange={(e) => setRName(e.target.value)} className={inputCls} />
                <input type="email" placeholder="Rider email (they log in with this)" value={rEmail} onChange={(e) => setREmail(e.target.value)} className={inputCls} />
                <input placeholder="Rider phone" value={rPhone} onChange={(e) => setRPhone(e.target.value)} className={inputCls} />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition">
                    <Check className="w-4 h-4" /> Save
                  </button>
                  <button type="button" onClick={() => setShowAddRider(false)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-sm font-semibold">Cancel</button>
                </div>
              </form>
            )}
            {riders.length === 0 && !showAddRider && (
              <p className="text-sm text-slate-400 text-center py-8">No riders yet. Add one to start assigning rides.</p>
            )}
            {riders.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-full bg-medical-100 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-medical-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{r.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{r.phone}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RideGroup({
  title, rides, riders, onAssign, onCancel, emptyLabel, history,
}: {
  title: string; rides: Ride[]; riders: RiderLite[];
  onAssign: (rideId: string, riderId: string) => void; onCancel: (rideId: string) => void;
  emptyLabel: string; history?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">{title} · {rides.length}</p>
      {rides.length === 0 && emptyLabel ? (
        <p className="text-sm text-slate-400 py-4">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {rides.map((ride) => (
            <RideCard key={ride.id} ride={ride} riders={riders} onAssign={onAssign} onCancel={onCancel} history={history} />
          ))}
        </div>
      )}
    </div>
  );
}

function RideCard({
  ride, riders, onAssign, onCancel, history,
}: {
  ride: Ride; riders: RiderLite[];
  onAssign: (rideId: string, riderId: string) => void; onCancel: (rideId: string) => void; history?: boolean;
}) {
  const [selected, setSelected] = useState("");
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-slate-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{ride.patient_first_name}</p>
            <a href={`tel:${ride.patient_phone}`} className="text-xs text-medical-600 font-mono flex items-center gap-1">
              <Phone className="w-3 h-3" /> {ride.patient_phone}
            </a>
          </div>
        </div>
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_STYLES[ride.status] ?? STATUS_STYLES.pending}`}>
          {ride.status}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        <p className="flex items-start gap-2 text-slate-600">
          <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span><span className="text-[11px] uppercase text-slate-400 font-semibold">Pickup</span><br />{ride.pickup_address}</span>
        </p>
        <p className="flex items-start gap-2 text-slate-600">
          <MapPin className="w-4 h-4 text-medical-500 shrink-0 mt-0.5" />
          <span><span className="text-[11px] uppercase text-slate-400 font-semibold">Drop-off</span><br />{ride.destination_lab}{ride.destination_address && ride.destination_address !== ride.destination_lab ? ` — ${ride.destination_address}` : ""}</span>
        </p>
      </div>

      {ride.rider_name && (
        <p className="mt-3 text-xs text-slate-500">Rider: <span className="font-semibold text-slate-700">{ride.rider_name}</span></p>
      )}

      {!history && ride.status === "pending" && (
        <div className="mt-3 flex gap-2">
          <select value={selected} onChange={(e) => setSelected(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-medical-400">
            <option value="">Assign a rider…</option>
            {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button disabled={!selected} onClick={() => onAssign(ride.id, selected)}
            className="px-4 py-2 rounded-xl bg-medical-600 disabled:opacity-40 text-white text-sm font-semibold hover:bg-medical-700 transition">
            Assign
          </button>
          <button onClick={() => onCancel(ride.id)} title="Cancel ride"
            className="px-3 py-2 rounded-xl bg-slate-100 text-slate-400 hover:text-red-500 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!history && ride.status === "assigned" && (
        <p className="mt-3 text-xs text-slate-400 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-emerald-500" /> Patient has been emailed the rider&apos;s phone number.
        </p>
      )}
    </div>
  );
}
