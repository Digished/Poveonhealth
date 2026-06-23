"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList, Activity, Stethoscope, Pill, FlaskConical, BedDouble, LogOut,
} from "lucide-react";
import type { EmrMe } from "@/components/emr/EmrShell";

const DEPARTMENTS = [
  { key: "onboarding", href: "/emr/onboarding", label: "Onboarding", icon: ClipboardList, queueKey: null },
  { key: "vitals", href: "/emr/vitals", label: "Vitals", icon: Activity, queueKey: "vitals" },
  { key: "consultation", href: "/emr/consultation", label: "Consultation", icon: Stethoscope, queueKey: "consultation" },
  { key: "pharmacy", href: "/emr/pharmacy", label: "Pharmacy", icon: Pill, queueKey: "pharmacy" },
  { key: "laboratory", href: "/emr/laboratory", label: "Laboratory", icon: FlaskConical, queueKey: "laboratory" },
  { key: "ward", href: "/emr/ward", label: "Ward", icon: BedDouble, queueKey: "ward" },
] as const;

const ROLE_DEPTS: Record<string, string[]> = {
  doctor: ["consultation", "ward"],
  nurse: ["vitals", "onboarding", "ward"],
  pharmacist: ["pharmacy"],
  lab_tech: ["laboratory"],
  ward_nurse: ["ward", "vitals"],
  onboarding_clerk: ["onboarding"],
  records: ["onboarding", "vitals", "consultation", "pharmacy", "laboratory", "ward"],
  super_admin: ["onboarding", "vitals", "consultation", "pharmacy", "laboratory", "ward"],
};

export default function EmrHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<EmrMe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/emr/me")
      .then((res) => {
        if (res.status === 401) { router.replace("/emr-login"); return null; }
        return res.json();
      })
      .then((data) => { if (data) setMe(data); })
      .finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await fetch("/api/emr-login/logout", { method: "POST" }).catch(() => {});
    router.replace("/emr-login");
  }

  if (loading) {
    return <div className="min-h-dvh bg-slate-50 flex items-center justify-center"><p className="text-sm text-slate-400">Loading…</p></div>;
  }
  if (!me) return null;

  const allowed = ROLE_DEPTS[me.staff.role] ?? [];
  const visible = DEPARTMENTS.filter((d) => allowed.includes(d.key));

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/40">
      <header className="bg-white/85 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-medical-600 to-medical-800 flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight truncate">{me.hospital_name}</p>
            <p className="text-[11px] text-slate-400 truncate">{me.staff.full_name} · {me.staff.role_label}</p>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 shrink-0">
            <LogOut className="w-3.5 h-3.5" /><span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Your departments</p>
        <div className="grid grid-cols-2 gap-3">
          {visible.map((d) => {
            const Icon = d.icon;
            const queue = d.queueKey ? me.queues[d.queueKey] ?? 0 : 0;
            return (
              <Link key={d.key} href={d.href} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 hover:border-medical-200 hover:shadow transition relative">
                {queue > 0 && (
                  <span className="absolute top-3 right-3 min-w-5 h-5 px-1.5 rounded-full bg-medical-600 text-white text-[11px] font-bold flex items-center justify-center">{queue}</span>
                )}
                <div className="w-11 h-11 rounded-xl bg-medical-50 text-medical-600 flex items-center justify-center mb-3"><Icon className="w-5 h-5" /></div>
                <p className="text-sm font-semibold text-slate-800">{d.label}</p>
                <p className="text-[11px] text-slate-400">{d.queueKey ? `${queue} waiting` : "Register patients"}</p>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
