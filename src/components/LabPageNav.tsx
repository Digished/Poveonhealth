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
  // true = hero is still in view → hide nav branding, transparent bg
  const [heroVisible, setHeroVisible] = useState(true);
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

  // Watch the hero element — when it leaves the scrollable viewport the nav
  // reveals itself with branding sliding in from the left.
  useEffect(() => {
    const main = document.querySelector("main");
    const hero = document.getElementById("lab-hero");
    if (!main || !hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      {
        root: main,
        threshold: 0,
        // shrink observable area by nav height so the transition fires just as
        // the hero bottom slips behind the sticky nav bar (~56 px)
        rootMargin: "-56px 0px 0px 0px",
      }
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  // Close login dropdown on outside click
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
      className={`sticky top-0 z-50 flex items-center justify-between px-4 py-3 transition-all duration-300 ease-in-out ${
        heroVisible
          ? "bg-transparent border-b border-transparent"
          : "bg-white/90 backdrop-blur-md border-b border-white/50 shadow-sm"
      }`}
    >
      {/* Lab branding — invisible while hero is showing, slides in when scrolled */}
      <div
        className={`flex items-center gap-2.5 min-w-0 transition-all duration-300 ease-in-out ${
          heroVisible
            ? "opacity-0 -translate-x-3 pointer-events-none"
            : "opacity-100 translate-x-0"
        }`}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={labName}
            className="w-8 h-8 rounded-xl object-cover ring-2 ring-white/70 shadow-sm shrink-0"
          />
        ) : (
          <PoveonLogo className="w-7 h-7 shrink-0" />
        )}
        <p className="text-sm font-bold text-slate-800 truncate max-w-[160px] sm:max-w-xs leading-tight">
          {labName}
        </p>
      </div>

      {/* When hero is visible keep the left side empty so login stays far right */}
      {heroVisible && <div />}

      {/* Right: session-aware login — always visible */}
      <div className="flex items-center gap-2 shrink-0">
        {!isLoading && loggedIn && typeof session === "object" && session !== null && (
          <>
            <Link
              href="/doc-login/dashboard"
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                heroVisible
                  ? "text-slate-700 hover:bg-white/60 hover:text-medical-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-medical-700"
              }`}
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
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition shadow-sm ${
                heroVisible
                  ? "bg-white/80 hover:bg-white text-slate-800 backdrop-blur-sm border border-white/60"
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              }`}
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
