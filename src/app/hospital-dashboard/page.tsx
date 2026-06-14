"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Hospital, LogOut, Inbox, Users, Settings, Clock, CheckCircle, Stethoscope,
} from "lucide-react";
import { HospitalInfo, HospitalCounts } from "@/components/hospital/types";
import { ReferralsTab } from "@/components/hospital/ReferralsTab";
import { DoctorsTab } from "@/components/hospital/DoctorsTab";
import { SettingsTab } from "@/components/hospital/SettingsTab";

type Tab = "referrals" | "doctors" | "settings";

const TABS: { key: Tab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { key: "referrals", label: "Referrals", shortLabel: "Referrals", icon: <Inbox className="w-3.5 h-3.5" /> },
  { key: "doctors",   label: "Doctors",   shortLabel: "Doctors",   icon: <Users className="w-3.5 h-3.5" /> },
  { key: "settings",  label: "Settings",  shortLabel: "Settings",  icon: <Settings className="w-3.5 h-3.5" /> },
];

export default function HospitalDashboardPage() {
  const router = useRouter();

  const [hospital, setHospital] = useState<HospitalInfo | null>(null);
  const [counts, setCounts] = useState<HospitalCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("referrals");

  const loadMe = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/hospital/me");
      if (res.status === 401) { router.replace("/hospital-login"); return; }
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load your hospital profile.");
        return;
      }
      setHospital(data.hospital);
      setCounts(data.counts);
    } catch {
      toast.error("Network error. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadMe(); }, [loadMe]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/hospital-login/logout", { method: "POST" });
    } catch {
      // proceed to login regardless
    }
    router.replace("/hospital-login");
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-white/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center shadow-sm shrink-0">
            <Hospital className="w-4 h-4 text-sky-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight truncate">
              {hospital?.name ?? "Hospital Portal"}
            </p>
            {hospital?.email && <p className="text-xs text-slate-400 truncate">{hospital.email}</p>}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50 transition px-3 py-1.5 rounded-lg hover:bg-red-50 shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{loggingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Loading skeleton while we fetch the hospital */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white/70 rounded-2xl border border-white/60 h-20" />
              ))}
            </div>
            <div className="bg-white/70 rounded-xl border border-white/60 h-10" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 h-24" />
            ))}
          </div>
        )}

        {!loading && hospital && (
          <>
            {/* Stat chips */}
            {counts && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-amber-500 mb-1">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-bold text-slate-800 leading-none">{counts.pending_referrals}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">Pending</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-emerald-500 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-bold text-slate-800 leading-none">{counts.accepted_referrals}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">Accepted</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-medical-500 mb-1">
                    <Stethoscope className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-bold text-slate-800 leading-none">{counts.doctors}</p>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">Doctors</p>
                </div>
              </div>
            )}

            {/* Tab navigation */}
            <div className="flex gap-1 bg-white/60 rounded-xl p-1 border border-white/60 shadow-sm overflow-x-auto">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                const badgeCount =
                  tab.key === "referrals" ? counts?.pending_referrals ?? 0
                  : tab.key === "doctors" ? counts?.doctors ?? 0
                  : 0;
                return (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      active ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}>
                    {tab.icon}
                    {tab.label}
                    {badgeCount > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                        active ? "bg-slate-100 text-slate-600" : "bg-slate-200/60 text-slate-500"
                      }`}>{badgeCount}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            {activeTab === "referrals" && (
              <ReferralsTab hospitalId={hospital.id} onCountsChange={() => loadMe(true)} />
            )}
            {activeTab === "doctors" && (
              <DoctorsTab onCountsChange={() => loadMe(true)} />
            )}
            {activeTab === "settings" && (
              <SettingsTab hospital={hospital} onHospitalUpdate={setHospital} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
