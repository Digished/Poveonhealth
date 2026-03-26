"use client";

import { useState, useEffect, useRef } from "react";
import {
  LogIn, ChevronDown, Stethoscope, User, LayoutDashboard, LogOut,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface DocSession { email: string }
interface LabPageNavProps { labName: string; logoUrl?: string | null }

export function LabPageNav({ labName, logoUrl }: LabPageNavProps) {
  const router = useRouter();
  const [session, setSession] = useState<DocSession | null | "loading">("loading");
  const [loginOpen, setLoginOpen] = useState(false);
  // true = hero is still visible in the scroll area
  const [heroVisible, setHeroVisible] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const floatDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/doc-login/me")
      .then((r) => r.json())
      .then((d) => { if (d.success) setSession({ email: d.doctor_email }); else setSession(null); })
      .catch(() => setSession(null));
  }, []);

  // IntersectionObserver: watch #lab-hero inside <main> — controls nav bar
  useEffect(() => {
    const main = document.querySelector("main");
    const hero = document.getElementById("lab-hero");
    if (!main || !hero) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setHeroVisible(entry.isIntersecting);
        if (!entry.isIntersecting) setLoginOpen(false);
      },
      { root: main, threshold: 0 },
    );
    obs.observe(hero);
    return () => obs.disconnect();
  }, []);


  // Close dropdown on outside click (handles both floating + nav dropdown)
  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      const inFloat = floatDropdownRef.current?.contains(t);
      const inNav   = dropdownRef.current?.contains(t);
      if (!inFloat && !inNav) setLoginOpen(false);
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
  const loggedIn  = session !== null && session !== "loading";

  // ── Shared login dropdown content ────────────────────────────────────────
  function LoginDropdown({ anchor }: { anchor: "float" | "nav" }) {
    return (
      <div className={`absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-[9999] animate-fade-in-up`}>
        <p className="text-xs text-slate-400 font-semibold px-4 pt-3 pb-1.5 uppercase tracking-wider">
          Log in as
        </p>
        <Link href="/doc-login" onClick={() => setLoginOpen(false)}
          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition group">
          <div className="w-7 h-7 rounded-lg bg-medical-50 border border-medical-100 flex items-center justify-center shrink-0">
            <Stethoscope className="w-3.5 h-3.5 text-medical-600" />
          </div>
          <p className="text-sm font-semibold text-slate-800 group-hover:text-medical-700 transition">
            Medical Professional
          </p>
        </Link>
        <Link href="/login" onClick={() => setLoginOpen(false)}
          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition group border-t border-slate-100">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
            <User className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-slate-800 group-hover:text-emerald-700 transition">
            Patient
          </p>
        </Link>
      </div>
    );
  }

  return (
    <>
      {/*
        Conditional rendering — only ONE of these two is ever in the DOM.
        This makes overlap structurally impossible regardless of timing.
      */}

      {/* ── Floating login button: same trigger as nav bar — exact swap ── */}
      {heroVisible && !isLoading && (
        <div
          className="fixed top-4 z-50 animate-float-btn-in"
          style={{ right: "max(1rem, calc((100vw - 42rem) / 2 + 1rem))" }}
        >
          {loggedIn && typeof session === "object" && (
            <div className="flex items-center gap-2">
              <Link href="/doc-login/dashboard"
                className="flex items-center gap-1.5 text-xs font-semibold bg-white/80 backdrop-blur-sm border border-white/60 text-slate-700 hover:bg-white px-3 py-1.5 rounded-xl shadow-sm transition">
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">My Dashboard</span>
              </Link>
              <button onClick={handleLogout}
                className="text-xs font-semibold text-slate-400 hover:text-red-600 bg-white/70 backdrop-blur-sm border border-white/50 px-2.5 py-1.5 rounded-xl shadow-sm transition"
                title="Sign out">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {!loggedIn && (
            <div className="relative" ref={floatDropdownRef}>
              <button onClick={() => setLoginOpen((v) => !v)}
                className="flex items-center gap-1.5 bg-white/80 hover:bg-white backdrop-blur-sm border border-white/60 text-slate-800 text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm transition">
                <LogIn className="w-3.5 h-3.5" />
                Login
                <ChevronDown className={`w-3 h-3 transition-transform ${loginOpen ? "rotate-180" : ""}`} />
              </button>
              {loginOpen && <LoginDropdown anchor="float" />}
            </div>
          )}
        </div>
      )}

      {/* ── Compact nav bar: only rendered when hero has scrolled away ── */}
      {!heroVisible && (
        <div className="shrink-0 z-50 animate-nav-slide-down">
          <div className="bg-white/90 backdrop-blur-md border-b border-slate-200/60 shadow-sm h-[52px]">
            <div className="max-w-2xl mx-auto px-4 h-full flex items-center justify-between">
              {/* Lab logo */}
              <div className="flex items-center">
                {logoUrl ? (
                  <img src={logoUrl} alt={labName}
                    className="w-8 h-8 rounded-xl object-cover ring-2 ring-white/70 shadow-sm" />
                ) : (
                  <PoveonLogo className="w-7 h-7 text-slate-800" />
                )}
              </div>

              {/* Right: session-aware actions */}
              {!isLoading && (
                <div className="flex items-center gap-2">
                  {loggedIn && typeof session === "object" && (
                    <>
                      <Link href="/doc-login/dashboard"
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-medical-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition">
                        <LayoutDashboard className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">My Dashboard</span>
                      </Link>
                      <button onClick={handleLogout}
                        className="text-xs font-semibold text-slate-400 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition"
                        title="Sign out">
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {!loggedIn && (
                    <div className="relative" ref={dropdownRef}>
                      <button onClick={() => setLoginOpen((v) => !v)}
                        className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-sm">
                        <LogIn className="w-3.5 h-3.5" />
                        Login
                        <ChevronDown className={`w-3 h-3 transition-transform ${loginOpen ? "rotate-180" : ""}`} />
                      </button>
                      {loginOpen && <LoginDropdown anchor="nav" />}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
