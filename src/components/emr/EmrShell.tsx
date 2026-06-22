"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Stethoscope, LogOut } from "lucide-react";

export interface EmrMe {
  staff: { id: string; full_name: string; role: string; role_label: string; home: string; department_key: string | null };
  hospital_name: string;
  queues: Record<string, number>;
}

const MeContext = createContext<EmrMe | null>(null);
export const useEmrMe = () => useContext(MeContext);

/**
 * Shared chrome for every staff workspace. Loads /api/emr/me, redirects to the
 * login on 401, and provides the current staff to children via context.
 * `allow` lists the roles permitted on the page (super_admin always allowed).
 */
export function EmrShell({
  title,
  allow,
  children,
}: {
  title: string;
  allow?: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [me, setMe] = useState<EmrMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/emr/me");
      if (res.status === 401) { router.replace("/emr-login"); return; }
      const data = await res.json();
      if (res.ok) {
        setMe(data);
        if (allow && data.staff.role !== "super_admin" && !allow.includes(data.staff.role)) {
          setDenied(true);
        }
      }
    } catch {
      // leave loading state
    } finally {
      setLoading(false);
    }
  }, [router, allow]);

  useEffect(() => { load(); }, [load]);

  async function logout() {
    await fetch("/api/emr-login/logout", { method: "POST" }).catch(() => {});
    router.replace("/emr-login");
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/40">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <Link href="/emr" className="w-8 h-8 rounded-xl bg-gradient-to-br from-medical-600 to-medical-800 flex items-center justify-center shrink-0">
            <Stethoscope className="w-4 h-4 text-white" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight truncate">{title}</p>
            <p className="text-[11px] text-slate-400 truncate">
              {me ? `${me.hospital_name} · ${me.staff.full_name}` : "Loading…"}
            </p>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 shrink-0">
            <LogOut className="w-3.5 h-3.5" /><span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {loading ? (
          <div className="space-y-3 animate-pulse pt-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-slate-100" />)}</div>
        ) : denied ? (
          <div className="text-center py-16">
            <p className="text-sm font-semibold text-slate-700">No access to this area</p>
            <p className="text-xs text-slate-400 mt-1">Your role can&apos;t open this department.</p>
            <Link href="/emr" className="inline-block mt-4 text-sm font-semibold text-medical-600">Back to home</Link>
          </div>
        ) : (
          <MeContext.Provider value={me}>{children}</MeContext.Provider>
        )}
      </main>
    </div>
  );
}
