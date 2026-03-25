"use client";

import { useState, useEffect, useRef } from "react";
import { LogIn, ChevronDown, Stethoscope, User, LayoutDashboard, LogOut } from "lucide-react";
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
  const [scrolled, setScrolled] = useState(false);
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

  // Shrink header on scroll — listen on the scrollable <main> element
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    function onScroll() {
      const top = main?.scrollTop ?? 0;
      setScrolled((prev) => {
        if (prev && top < 50) return false;
        if (!prev && top > 90) return true;
        return prev;
      });
    }
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
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
    <div
      className={`sticky top-0 z-50 flex items-center justify-between border-b border-white/40 bg-white/80 backdrop-blur-md transition-all duration-300 ease-in-out ${
        scrolled ? "px-4 py-2" : "px-5 py-3.5"
      }`}
    >
      {/* Lab branding */}
      <div className="flex items-center gap-2.5 min-w-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={labName}
            className={`rounded-xl object-cover ring-2 ring-white/70 shadow-sm shrink-0 transition-all duration-300 ${
              scrolled ? "w-7 h-7" : "w-10 h-10"
            }`}
          />
        ) : (
          <PoveonLogo
            className={`shrink-0 transition-all duration-300 ${scrolled ? "w-7 h-7" : "w-9 h-9"}`}
          />
        )}
        <div className="min-w-0 overflow-hidden">
          <p
            className={`font-bold text-slate-800 truncate leading-tight transition-all duration-300 ${
              scrolled ? "text-sm max-w-[160px] sm:max-w-xs" : "text-base max-w-[180px] sm:max-w-none"
            }`}
          >
            {labName}
          </p>
          {!scrolled && (
            <p className="text-xs text-slate-400 leading-none mt-0.5 transition-all duration-300">
              Lab Request Portal
            </p>
          )}
        </div>
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
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-[9999] animate-fade-in-up">
                <p className="text-xs text-slate-400 font-semibold px-4 pt-3 pb-1.5 uppercase tracking-wider">
                  Log in as
                </p>
                <Link
                  href="/doc-login"
                  onClick={() => setLoginOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition group"
                >
                  <div className="w-7 h-7 rounded-lg bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0">
                    <Stethoscope className="w-3.5 h-3.5 text-medical-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-medical-700 transition">
                    Medical Professional
                  </p>
                </Link>
                <Link
                  href="/login"
                  onClick={() => setLoginOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition group border-t border-slate-100"
                >
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700 transition">
                    Patient
                  </p>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
