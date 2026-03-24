"use client";

import { useState, useEffect, useRef } from "react";
import { LogIn, ChevronDown, FlaskConical, Stethoscope, User, LayoutDashboard, LogOut } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface DocSession {
  email: string;
}

interface LabPageNavProps {
  labName: string;
  logoUrl?: string | null;
}

export function LabPageNav({ labName, logoUrl }: LabPageNavProps) {
  const router = useRouter();
  const [session, setSession] = useState<DocSession | null | "loading">("loading");
  const [loginOpen, setLoginOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/doc-login/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setSession({ email: d.doctor_email });
        else setSession(null);
      })
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLoginOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleLogout() {
    await fetch("/api/doc-login/logout", { method: "POST" });
    setSession(null);
    router.refresh();
  }

  const isLoading = session === "loading";
  const loggedIn = session !== null && session !== "loading";

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/40 bg-white/60 backdrop-blur-md">
      {/* Lab branding */}
      <div className="flex items-center gap-2 min-w-0">
        {logoUrl ? (
          <img src={logoUrl} alt={labName} className="w-7 h-7 rounded-lg object-cover ring-1 ring-white/60 shrink-0" />
        ) : (
          <PoveonLogo className="w-7 h-7 shrink-0" />
        )}
        <span className="text-sm font-bold text-slate-800 truncate max-w-[160px] sm:max-w-none">{labName}</span>
      </div>

      {/* Right: session-aware login */}
      <div className="flex items-center gap-2 shrink-0">
        {!isLoading && loggedIn && typeof session === "object" && session !== null && (
          <>
            <Link
              href="/doc-login/dashboard"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-medical-700 px-3 py-1.5 rounded-lg hover:bg-white/60 transition"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">My Dashboard</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50/60 transition"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </>
        )}

        {!isLoading && !loggedIn && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setLoginOpen((v) => !v)}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              Login
              <ChevronDown className={`w-3 h-3 transition-transform ${loginOpen ? "rotate-180" : ""}`} />
            </button>

            {loginOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 animate-fade-in-up">
                <p className="text-xs text-slate-400 font-semibold px-4 pt-3 pb-1.5 uppercase tracking-wider">Log in as</p>

                <Link
                  href="/lab-login"
                  onClick={() => setLoginOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition group"
                >
                  <div className="w-7 h-7 rounded-lg bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                    <FlaskConical className="w-3.5 h-3.5 text-sky-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-sky-700 transition">Laboratory</p>
                </Link>

                <Link
                  href="/doc-login"
                  onClick={() => setLoginOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition group"
                >
                  <div className="w-7 h-7 rounded-lg bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0">
                    <Stethoscope className="w-3.5 h-3.5 text-medical-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-medical-700 transition">Medical Professional</p>
                </Link>

                <Link
                  href="/login"
                  onClick={() => setLoginOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition group border-t border-slate-100"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700 transition">Patient</p>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
