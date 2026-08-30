"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, ChevronDown, FlaskConical, Stethoscope, User, Building2,
  LayoutDashboard, LogOut, Menu, X, ShieldCheck, Code2, Truck, TrendingUp, Sparkles, HeartPulse, Pill,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";

type PanelId = "platform" | "login" | null;

const AUDIENCES = [
  {
    href: "/#for-clinicians",
    icon: Stethoscope,
    title: "For clinicians",
    blurb: "Send a request in under a minute — no account needed.",
    tone: "text-medical-600 bg-medical-50 border-medical-100",
  },
  {
    href: "/#for-patients",
    icon: User,
    title: "For patients",
    blurb: "Track your request, your queue place and your results.",
    tone: "text-emerald-600 bg-emerald-50 border-emerald-100",
  },
  {
    href: "/#for-labs",
    icon: FlaskConical,
    title: "For laboratories",
    blurb: "Requests, queue, results and billing in one workspace.",
    tone: "text-sky-600 bg-sky-50 border-sky-100",
  },
  {
    href: "/#for-hospitals",
    icon: Building2,
    title: "For hospitals",
    blurb: "Refer out, run an EMR and keep every result in one chart.",
    tone: "text-violet-600 bg-violet-50 border-violet-100",
  },
];

const PORTALS = [
  { href: "/lab-login", icon: FlaskConical, title: "Laboratory", blurb: "Manage requests & results", tone: "text-sky-600 bg-sky-50 border-sky-100" },
  { href: "/doc-login", icon: Stethoscope, title: "Medical professional", blurb: "Track referrals & earnings", tone: "text-medical-600 bg-medical-50 border-medical-100" },
  { href: "/login", icon: User, title: "Patient", blurb: "View your test results", tone: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  { href: "/hospital-login", icon: Building2, title: "Hospital", blurb: "Referrals, wards & EMR", tone: "text-violet-600 bg-violet-50 border-violet-100" },
  { href: "/pharmacy-login", icon: Pill, title: "Pharmacy", blurb: "Serve care-plan members", tone: "text-amber-600 bg-amber-50 border-amber-100" },
];

const MORE_PORTALS = [
  { href: "/consults", icon: HeartPulse, label: "Care plan" },
  { href: "/pharmacies", icon: Pill, label: "Find a pharmacy" },
  { href: "/scale", icon: TrendingUp, label: "Marketer" },
  { href: "/logistics", icon: Truck, label: "Logistics" },
  { href: "/rider", icon: Truck, label: "Rider" },
];

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/security", label: "Security" },
  { href: "/api-docs", label: "Developers" },
];

export function SiteNav({ onStartRequest }: { onStartRequest?: () => void }) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [panel, setPanel] = useState<PanelId>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState<{ email: string } | null | "loading">("loading");
  const navRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 10); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lightweight check for an active medical-professional session
  useEffect(() => {
    let alive = true;
    fetch("/api/doc-login/me")
      .then((r) => r.json())
      .then((d) => { if (alive) setSession(d.success ? { email: d.doctor_email } : null); })
      .catch(() => { if (alive) setSession(null); });
    return () => { alive = false; };
  }, []);

  // Close panels on outside click / Escape
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setPanel(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setPanel(null); setMobileOpen(false); }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Lock the page while the mobile sheet is open
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  function openPanel(id: PanelId) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPanel(id);
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPanel(null), 140);
  }

  async function handleLogout() {
    await fetch("/api/doc-login/logout", { method: "POST" });
    setSession(null);
    setPanel(null);
    setMobileOpen(false);
    router.refresh();
  }

  function handleStart() {
    setMobileOpen(false);
    setPanel(null);
    if (onStartRequest) onStartRequest();
    else router.push("/#choose-lab");
  }

  const loggedIn = session !== null && session !== "loading";

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[120] px-3 sm:px-5 pt-3 sm:pt-4 pointer-events-none">
        <div
          ref={navRef}
          className={`pointer-events-auto mx-auto flex max-w-6xl items-center gap-2 rounded-[22px] border transition-all duration-300 ${
            scrolled
              ? "border-black/[0.06] bg-white/85 px-3 py-2 shadow-[0_10px_34px_-12px_rgba(15,23,42,0.28)] backdrop-blur-xl sm:px-4"
              : "border-white/70 bg-white/60 px-3 py-2.5 shadow-[0_6px_24px_-16px_rgba(15,23,42,0.3)] backdrop-blur-lg sm:px-4 sm:py-3"
          }`}
        >
          {/* Brand */}
          <Link href="/" className="group flex shrink-0 items-center gap-2 rounded-2xl px-1.5 py-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 shadow-sm transition-transform duration-300 group-hover:scale-105 group-hover:rotate-3">
              <PoveonLogo className="h-[18px] w-[18px] text-white" />
            </span>
            <span className="text-[15px] font-bold tracking-tight text-slate-900">Poveon</span>
          </Link>

          {/* Desktop links */}
          <div className="ml-1 hidden flex-1 items-center gap-0.5 lg:flex">
            <div
              className="relative"
              onMouseEnter={() => openPanel("platform")}
              onMouseLeave={scheduleClose}
            >
              <button
                type="button"
                onClick={() => setPanel(panel === "platform" ? null : "platform")}
                className={`flex items-center gap-1 rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors ${
                  panel === "platform" ? "bg-slate-900/[0.06] text-slate-900" : "text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900"
                }`}
                aria-expanded={panel === "platform"}
              >
                Platform
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${panel === "platform" ? "rotate-180" : ""}`} />
              </button>

              {panel === "platform" && (
                <div className="animate-nav-panel absolute left-0 top-full w-[520px] pt-3">
                  <div className="overflow-hidden rounded-3xl border border-black/[0.06] bg-white p-2 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)]">
                    <div className="grid grid-cols-2 gap-1">
                      {AUDIENCES.map((a) => {
                        const Icon = a.icon;
                        return (
                          <Link
                            key={a.href}
                            href={a.href}
                            onClick={() => setPanel(null)}
                            className="group flex gap-3 rounded-2xl p-3 transition-colors hover:bg-slate-50"
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${a.tone}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[13.5px] font-semibold text-slate-900">{a.title}</span>
                              <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{a.blurb}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3">
                      <p className="text-xs leading-relaxed text-slate-300">
                        <span className="font-semibold text-white">No sign-up required.</span> Pick a lab and send your first request.
                      </p>
                      <button
                        type="button"
                        onClick={handleStart}
                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-slate-900 transition-transform hover:scale-[1.03]"
                      >
                        Start <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-full px-3.5 py-2 text-[13.5px] font-medium text-slate-600 transition-colors hover:bg-slate-900/[0.04] hover:text-slate-900"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex-1 lg:hidden" />

          {/* Right cluster */}
          <div className="flex shrink-0 items-center gap-1.5">
            {loggedIn && typeof session === "object" && session !== null ? (
              <>
                <Link
                  href="/doc-login/dashboard"
                  className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-900/[0.04] hover:text-slate-900 sm:flex"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign out"
                  className="hidden rounded-full p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 sm:block"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div
                className="relative hidden sm:block"
                onMouseEnter={() => openPanel("login")}
                onMouseLeave={scheduleClose}
              >
                <button
                  type="button"
                  onClick={() => setPanel(panel === "login" ? null : "login")}
                  className={`flex items-center gap-1 rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors ${
                    panel === "login" ? "bg-slate-900/[0.06] text-slate-900" : "text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900"
                  }`}
                  aria-expanded={panel === "login"}
                >
                  Log in
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${panel === "login" ? "rotate-180" : ""}`} />
                </button>

                {panel === "login" && (
                  <div className="animate-nav-panel absolute right-0 top-full w-[290px] pt-3">
                    <div className="overflow-hidden rounded-3xl border border-black/[0.06] bg-white p-2 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)]">
                      {PORTALS.map((p) => {
                        const Icon = p.icon;
                        return (
                          <Link
                            key={p.href}
                            href={p.href}
                            onClick={() => setPanel(null)}
                            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                          >
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${p.tone}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span>
                              <span className="block text-[13px] font-semibold text-slate-900">{p.title}</span>
                              <span className="block text-[11px] text-slate-400">{p.blurb}</span>
                            </span>
                          </Link>
                        );
                      })}
                      <div className="mt-1 flex items-center gap-1 border-t border-slate-100 px-2 pt-2">
                        {MORE_PORTALS.map((m) => {
                          const Icon = m.icon;
                          return (
                            <Link
                              key={m.href}
                              href={m.href}
                              onClick={() => setPanel(null)}
                              className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {m.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleStart}
              className="group flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md active:scale-95 sm:px-5"
            >
              Request a test
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-900/[0.05] lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile sheet — portalled to <body> so no ancestor can clip it */}
      {mounted && mobileOpen && createPortal(
        <div className="fixed inset-0 z-[130] lg:hidden">
          <div
            className="animate-backdrop-in absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="animate-sheet-up absolute inset-x-0 bottom-0 top-0 flex flex-col overflow-y-auto bg-[#FAF8F3] px-5 pb-8 pt-4">
            <div className="flex items-center justify-between">
              <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900">
                  <PoveonLogo className="h-5 w-5 text-white" />
                </span>
                <span className="text-base font-bold tracking-tight text-slate-900">Poveon</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleStart}
              className="animate-nav-item mt-6 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-left text-white shadow-lg"
              style={{ animationDelay: "40ms" }}
            >
              <span>
                <span className="block text-[15px] font-bold">Request a test</span>
                <span className="mt-0.5 block text-xs text-slate-300">Pick a lab — the form opens right here</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0" />
            </button>

            <p className="animate-nav-item mt-7 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400" style={{ animationDelay: "80ms" }}>
              Log in
            </p>
            <div className="mt-2 space-y-1.5">
              {loggedIn && (
                <Link
                  href="/doc-login/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="animate-nav-item flex items-center gap-3 rounded-2xl border border-medical-100 bg-medical-50 px-4 py-3 text-sm font-semibold text-medical-700"
                  style={{ animationDelay: "100ms" }}
                >
                  <LayoutDashboard className="h-4 w-4" /> My dashboard
                </Link>
              )}
              {PORTALS.map((p, i) => {
                const Icon = p.icon;
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    onClick={() => setMobileOpen(false)}
                    className="animate-nav-item flex items-center gap-3 rounded-2xl border border-stone-200/70 bg-white px-4 py-3"
                    style={{ animationDelay: `${120 + i * 40}ms` }}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${p.tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{p.title}</span>
                  </Link>
                );
              })}
              {loggedIn && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="animate-nav-item flex w-full items-center gap-3 rounded-2xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm font-semibold text-red-600"
                  style={{ animationDelay: "300ms" }}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              )}
            </div>

            <p className="animate-nav-item mt-7 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400" style={{ animationDelay: "330ms" }}>
              Platform
            </p>
            <div className="mt-2 space-y-1.5">
              {AUDIENCES.map((a, i) => {
                const Icon = a.icon;
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    onClick={() => setMobileOpen(false)}
                    className="animate-nav-item flex items-center gap-3 rounded-2xl border border-stone-200/70 bg-white px-4 py-3"
                    style={{ animationDelay: `${350 + i * 45}ms` }}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${a.tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{a.title}</span>
                      <span className="block truncate text-xs text-slate-400">{a.blurb}</span>
                    </span>
                  </Link>
                );
              })}
            </div>

            <p className="animate-nav-item mt-7 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400" style={{ animationDelay: "540ms" }}>
              Explore
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {LINKS.map((l, i) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="animate-nav-item rounded-2xl border border-stone-200/70 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                  style={{ animationDelay: `${560 + i * 40}ms` }}
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-200/70 pt-5 text-xs text-slate-400">
              <Link href="/about" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> About</Link>
              <Link href="/security" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Security</Link>
              <Link href="/api-docs" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-1"><Code2 className="h-3 w-3" /> API</Link>
              <Link href="/contact" onClick={() => setMobileOpen(false)}>Contact</Link>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
