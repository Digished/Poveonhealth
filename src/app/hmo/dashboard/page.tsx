"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, LogOut } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { PoveonLogo } from "@/components/PoveonLogo";
import { VitalsEntryCard } from "@/components/hmo/VitalsEntryCard";
import { VitalsHistory, Reading } from "@/components/hmo/VitalsHistory";

type Member = {
  id: string;
  email: string;
  full_name: string;
  policy_number: string;
  hmo_name: string;
};

export default function HmoDashboardPage() {
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReadings = useCallback(async () => {
    const res = await fetch("/api/hmo/vitals?limit=90", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setReadings(data.readings ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/hmo/me", { cache: "no-store" });
        if (!res.ok) {
          router.replace("/hmo");
          return;
        }
        const data = await res.json();
        setMember(data.member);
        await loadReadings();
      } finally {
        setLoading(false);
      }
    })();
  }, [router, loadReadings]);

  async function handleLogout() {
    await fetch("/api/hmo/logout", { method: "POST" });
    router.replace("/hmo");
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="animate-pulse text-slate-400 text-sm">Loading your health data…</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      <Toaster position="top-center" />
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-md border-b border-white/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center p-2">
              <PoveonLogo className="w-full h-full text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <HeartPulse className="w-4 h-4 text-medical-600" /> Health Monitoring
              </p>
              {member && (
                <p className="text-xs text-slate-400">
                  {member.full_name} · {member.hmo_name} · {member.policy_number}
                </p>
              )}
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600 transition">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <VitalsEntryCard onSaved={loadReadings} />
        <VitalsHistory readings={readings} />
      </main>
    </div>
  );
}
