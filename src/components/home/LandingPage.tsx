"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Stethoscope, User, FlaskConical, Building2, Camera, Zap, Sparkles,
  BellRing, KeyRound, FileText, Network, Truck, Code2, ShieldCheck, ScrollText,
  Users, ChevronDown, Check, Clock, MapPin, HeartPulse, Pill, MessageSquareText,
} from "lucide-react";

import { SiteNav } from "@/components/site/SiteNav";
import { Reveal } from "@/components/site/Reveal";
import { HeroSlip } from "@/components/home/HeroSlip";
import { LabPicker, type LandingLab } from "@/components/home/LabPicker";
import { LabFormModal, type ModalLab } from "@/components/request/LabFormModal";
import { PoveonLogo } from "@/components/PoveonLogo";

export interface LandingStats {
  labs: number;
  catalogTests: number;
  states: number;
  requests: number;
}

/* ── Content ────────────────────────────────────────────────────────────────
   Everything below describes what Poveon actually does today. Keep it that way
   when editing: each claim maps to a shipped feature in this repo.            */

const AUDIENCES = [
  {
    id: "for-clinicians",
    eyebrow: "For clinicians",
    icon: Stethoscope,
    title: "Refer a patient without leaving the consulting room",
    body: "Open the lab's form, enter the patient and the tests, send. Your details are remembered on your device for next time, so the second request takes seconds.",
    points: [
      "No account required — your email is your identity",
      "Photograph a handwritten request slip and let Poveon read it back to you",
      "Test names are matched against the lab's own catalogue as you type",
      "Track every referral, result and commission in your dashboard",
    ],
    accent: "from-medical-600 to-sky-500",
    chip: "text-medical-700 bg-medical-50 border-medical-100",
    href: "/doc-login",
    hrefLabel: "Clinician portal",
  },
  {
    id: "for-patients",
    eyebrow: "For patients",
    icon: User,
    title: "Show the code, keep your place in the queue",
    body: "Your clinician's request reaches the lab before you do. You get a request code by email and SMS, register yourself at the lab by scanning its QR code, and watch your position in the queue from your phone.",
    points: [
      "A request code that identifies you at reception — nothing to print",
      "Self-registration by QR at the lab, with your own ticket number",
      "Live queue position while you wait",
      "Results and updates by email, SMS and WhatsApp",
    ],
    accent: "from-emerald-600 to-teal-500",
    chip: "text-emerald-700 bg-emerald-50 border-emerald-100",
    href: "/login",
    hrefLabel: "Patient portal",
  },
  {
    id: "for-labs",
    eyebrow: "For laboratories",
    icon: FlaskConical,
    title: "Every request, sample and result in one workspace",
    body: "Requests land the moment they're sent. Your team works the queue, records results against your own templates, and sends reports out — with pricing, commissions and turnaround time tracked as you go.",
    points: [
      "Live queue with arrival, attending and journey stages",
      "Your catalogue and price list, bulk-uploaded from a spreadsheet",
      "Result templates, verified PDF reports and combined result sends",
      "HL7 / Mirth interfacing, API keys, roles, SOPs and feedback QR codes",
    ],
    accent: "from-sky-600 to-indigo-500",
    chip: "text-sky-700 bg-sky-50 border-sky-100",
    href: "/lab-login",
    hrefLabel: "Lab dashboard",
  },
  {
    id: "for-hospitals",
    eyebrow: "For hospitals & HMOs",
    icon: Building2,
    title: "Refer out, run your wards, keep one patient record",
    body: "Hospitals send referrals with a printable letter, manage departments and staff, and run consultations, vitals, admissions, pharmacy and lab orders in the built-in EMR. HMOs monitor enrolled members' vitals and alerts.",
    points: [
      "Referrals with tracking and a generated referral letter",
      "EMR: vitals, consultation notes, wards, pharmacy, lab orders",
      "Departments, staff and doctor accounts under one hospital",
      "HMO roster import with member vitals and flagged alerts",
    ],
    accent: "from-violet-600 to-fuchsia-500",
    chip: "text-violet-700 bg-violet-50 border-violet-100",
    href: "/hospital-login",
    hrefLabel: "Hospital portal",
  },
];

const FEATURES = [
  {
    icon: Camera,
    title: "Reads a handwritten slip",
    body: "Photograph a paper request and Poveon extracts the tests, diagnosis and patient details for you to confirm.",
  },
  {
    icon: Zap,
    title: "Queue that runs itself",
    body: "Patients register at the lab by QR, take a ticket number and watch their position live while the front desk works the list.",
  },
  {
    icon: Sparkles,
    title: "Catalogue-backed tests",
    body: "Test names are resolved against the chosen lab's own catalogue and price list — never invented, and priced as the lab priced them.",
  },
  {
    icon: BellRing,
    title: "Instant notifications",
    body: "Labs are alerted the second a request lands. Patients and clinicians get email, SMS and WhatsApp at each stage.",
  },
  {
    icon: KeyRound,
    title: "One request code",
    body: "Every request gets a short code. Show it at reception, track it online, and pick results up against it.",
  },
  {
    icon: FileText,
    title: "Results that look right",
    body: "Labs record results against their own templates and send verified PDF reports, receipts and combined result sets.",
  },
  {
    icon: Network,
    title: "Talks to your LIMS",
    body: "HL7 ORU messaging and Mirth interfacing, plus scoped API keys and request logs for labs that build their own.",
  },
  {
    icon: Truck,
    title: "Free rides to the lab",
    body: "Where a lab has a logistics partner, a clinician can send a patient a free ride, tracked from pickup to arrival.",
  },
];

const STEPS = [
  {
    n: "01",
    icon: Building2,
    title: "Pick the laboratory",
    body: "Search partner labs by name, city or the tests they run. Choosing one opens that lab's own request sheet — its logo, its address, its branches.",
  },
  {
    n: "02",
    icon: ScrollText,
    title: "Fill the form on screen",
    body: "Location, patient and tests, then your referring details. It moves in short steps with sub-steps, remembers who you are, and checks phone numbers and emails as you type.",
  },
  {
    n: "03",
    icon: BellRing,
    title: "The lab has it instantly",
    body: "Submit and the lab is notified at once. You keep a request code, the patient gets it too, and results come back through the same thread.",
  },
];

const SECURITY = [
  { icon: ShieldCheck, title: "Encrypted in transit", body: "Every request travels over TLS and is delivered only to the laboratory it names." },
  { icon: Users, title: "Scoped access", body: "Lab staff work under named roles with their own permissions — viewing, results, team management." },
  { icon: ScrollText, title: "Auditable journey", body: "Registered, collected, received, in analysis, verified, reported — each stage timestamped against the request." },
  { icon: Check, title: "Consent captured", body: "Patient consent is recorded at intake and stored with the request for data-integrity requirements." },
];

const FAQS = [
  {
    q: "Do I need an account to send a request?",
    a: "No. Clinicians and patients can send a request with no sign-up at all — your email address identifies you. Creating a portal login is optional and only adds tracking, saved details and dashboards.",
  },
  {
    q: "How does the lab receive my request?",
    a: "The moment you submit, the request appears in the lab's dashboard queue and its notification addresses are emailed. Labs that run a LIMS can also take requests over HL7/Mirth or the API.",
  },
  {
    q: "What does my patient have to do?",
    a: "Nothing but show up. They receive the request code by email and SMS, present it at reception, and the lab pulls up everything you sent.",
  },
  {
    q: "What if I'm the patient, not a clinician?",
    a: "Requests sent from this page come from a referring clinician. At a partner lab you can register yourself at the front desk by scanning the lab's QR code — that puts you in the queue with your own ticket number, which you can follow from your phone.",
  },
  {
    q: "How do labs join Poveon?",
    a: "Labs are onboarded with their catalogue, price list, branches and team, and get a branded page of their own at poveon.com/your-lab. Get in touch and we'll walk you through it.",
  },
];

/* ── Small pieces ───────────────────────────────────────────────────────── */

function useCountUp(target: number, run: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const duration = 1100;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return value;
}

function StatBlock({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setRun(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setRun(true); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shown = useCountUp(value, run);

  return (
    <div ref={ref} className="text-center sm:text-left">
      <p className="text-[30px] font-black leading-none tracking-tight text-slate-900 sm:text-[36px]">
        {shown.toLocaleString()}
        {suffix && <span className="text-medical-600">{suffix}</span>}
      </p>
      <p className="mt-2 text-[12px] font-medium leading-snug text-slate-500">{label}</p>
    </div>
  );
}

function FaqItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className={`overflow-hidden rounded-2xl border transition-colors ${open ? "border-medical-200 bg-white" : "border-stone-200/80 bg-white/70"}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-[14.5px] font-semibold text-slate-900">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180 text-medical-600" : ""}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-[13.5px] leading-relaxed text-slate-500">{a}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export function LandingPage({ labs, stats }: { labs: LandingLab[]; stats: LandingStats }) {
  const [activeLab, setActiveLab] = useState<ModalLab | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [audience, setAudience] = useState(0);

  const openLab = useCallback((lab: LandingLab) => {
    setActiveLab({
      id: lab.id,
      name: lab.name,
      slug: lab.slug,
      address: lab.address,
      logo_url: lab.logo_url,
      phones: lab.phones,
      whatsapp: lab.whatsapp,
      service_categories: (lab.service_categories ?? []) as string[],
    });
    setModalOpen(true);
  }, []);

  const scrollToPicker = useCallback(() => {
    document.getElementById("choose-lab")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Nudge focus to the search field once the scroll settles
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('#choose-lab input[type="text"]')?.focus({ preventScroll: true });
    }, 620);
  }, []);

  // Deep links like /#for-labs should select that tab, not just scroll to it.
  useEffect(() => {
    function syncFromHash() {
      const id = window.location.hash.replace("#", "");
      const idx = AUDIENCES.findIndex((a) => a.id === id);
      if (idx >= 0) {
        setAudience(idx);
        setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
      }
    }
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const marqueeLabs = labs.length > 0 ? [...labs, ...labs].slice(0, Math.max(12, labs.length * 2)) : [];
  const active = AUDIENCES[audience];
  const ActiveIcon = active.icon;

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#FAF8F3]">
      {/* Page wash */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 100% 60% at 50% 0%, rgba(254,243,221,0.85) 0%, rgba(250,248,243,0.4) 55%, transparent 82%), " +
            "radial-gradient(ellipse 65% 45% at 88% 12%, rgba(224,242,254,0.55) 0%, transparent 68%), " +
            "radial-gradient(ellipse 55% 40% at 4% 40%, rgba(255,237,213,0.45) 0%, transparent 68%)",
        }}
      />
      <div className="animate-aurora pointer-events-none absolute -top-40 left-1/2 -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-medical-200/25 blur-[120px]" aria-hidden="true" />

      <SiteNav onStartRequest={scrollToPicker} />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="px-4 pt-28 sm:pt-32 lg:pt-36">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-stone-200/90 bg-white/70 py-1.5 pl-1.5 pr-3.5 text-[12px] font-medium text-slate-600 backdrop-blur">
                <span className="flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
                  <HeartPulse className="h-3 w-3" /> Live
                </span>
                {stats.labs > 0 ? `${stats.labs} partner ${stats.labs === 1 ? "laboratory" : "laboratories"} accepting requests` : "Partner laboratories accepting requests"}
              </span>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-5 text-[38px] font-black leading-[1.04] tracking-[-0.03em] text-slate-900 sm:text-[52px] lg:text-[58px]">
                Send a lab request
                <br className="hidden sm:block" />{" "}
                <span className="relative whitespace-nowrap">
                  <span className="relative z-10 bg-gradient-to-r from-medical-700 via-medical-600 to-sky-500 bg-clip-text text-transparent">
                    in a minute flat.
                  </span>
                  <svg className="absolute -bottom-2 left-0 z-0 h-3 w-full text-medical-300/70" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M2 8 C 80 2, 220 2, 298 7" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-slate-600 sm:text-[17.5px]">
                Choose a laboratory and its request form opens right here — the same sheet you&apos;d fill by hand,
                only it arrives the moment you sign it. No account, no fax, no chasing results.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={scrollToPicker}
                  className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-4 text-[15px] font-bold text-white shadow-[0_18px_35px_-18px_rgba(15,23,42,0.9)] transition-all hover:bg-slate-800 hover:shadow-[0_22px_45px_-18px_rgba(15,23,42,0.95)] active:scale-[0.98]"
                >
                  Choose your lab
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </button>
                <Link
                  href="/#how-it-works"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-200/90 bg-white/70 px-6 py-4 text-[15px] font-semibold text-slate-700 backdrop-blur transition-all hover:border-stone-300 hover:bg-white"
                >
                  See how it works
                </Link>
              </div>
            </Reveal>

            <Reveal delay={240}>
              <ul className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-slate-500">
                {["No sign-up for clinicians", "Encrypted in transit", "Email, SMS & WhatsApp updates"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={3} />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delay={140} className="lg:pl-6">
            <HeroSlip />
          </Reveal>
        </div>
      </section>

      {/* ── Partner marquee ────────────────────────────────────────────── */}
      {marqueeLabs.length > 0 && (
        <section className="mt-20 sm:mt-24">
          <Reveal>
            <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Requests are going out to
            </p>
          </Reveal>
          <div className="marquee-mask marquee-pause mt-6 overflow-hidden">
            <div className="marquee-track flex w-max gap-3" style={{ "--marquee-duration": `${Math.max(26, marqueeLabs.length * 3.4)}s` } as React.CSSProperties}>
              {[...marqueeLabs, ...marqueeLabs].map((lab, i) => (
                <button
                  key={`${lab.id}-${i}`}
                  type="button"
                  onClick={() => openLab(lab)}
                  className="flex shrink-0 items-center gap-2.5 rounded-2xl border border-stone-200/70 bg-white/70 px-4 py-2.5 backdrop-blur-sm transition-colors hover:border-medical-200 hover:bg-white"
                >
                  {lab.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={lab.logo_url} alt="" className="h-7 w-7 rounded-lg object-contain" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-medical-50 text-medical-600">
                      <FlaskConical className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="whitespace-nowrap text-[13px] font-semibold text-slate-600">{lab.name}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Choose a lab ───────────────────────────────────────────────── */}
      <section id="choose-lab" className="scroll-mt-28 px-4 pb-4 pt-20 sm:pt-24">
        <div className="mx-auto max-w-5xl">
          <Reveal className="text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-medical-600">Start here</span>
            <h2 className="mt-3 text-[28px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-[38px]">
              Choose your laboratory
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-slate-500">
              Pick a lab and its request form opens as a sheet of its own headed paper — branches, contact details and all.
            </p>
          </Reveal>

          <Reveal delay={80} className="mt-8">
            <LabPicker labs={labs} onPick={openLab} />
          </Reveal>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:py-20">
        <Reveal className="mx-auto max-w-5xl">
          <div className="grid grid-cols-2 gap-8 rounded-3xl border border-stone-200/70 bg-white/70 px-6 py-8 backdrop-blur sm:px-10 lg:grid-cols-4">
            <StatBlock value={stats.labs} label="Partner laboratories on the network" />
            <StatBlock value={stats.catalogTests} label="Tests priced across partner catalogues" />
            {stats.states > 0 && <StatBlock value={stats.states} label="States with a partner lab" />}
            {stats.requests > 0 && <StatBlock value={stats.requests} label="Requests processed to date" />}
          </div>
        </Reveal>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-28 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-medical-600">How it works</span>
            <h2 className="mt-3 text-[28px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-[40px]">
              Three steps, and it&apos;s with the lab
            </h2>
            <p className="mt-4 text-[15.5px] leading-relaxed text-slate-500">
              The flow is deliberately familiar: it&apos;s the paper request form you already know, with the parts that
              usually go wrong — legibility, contact details, delivery — taken care of.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.n} delay={i * 90} className="h-full">
                  <div className="group relative h-full overflow-hidden rounded-3xl border border-stone-200/80 bg-white/80 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-medical-200 hover:shadow-[0_28px_50px_-30px_rgba(2,112,195,0.6)]">
                    <span className="absolute -right-3 -top-5 text-[76px] font-black leading-none text-slate-900/[0.04] transition-colors group-hover:text-medical-600/[0.07]">
                      {s.n}
                    </span>
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="relative mt-5 text-[17px] font-bold tracking-tight text-slate-900">{s.title}</h3>
                    <p className="relative mt-2.5 text-[13.5px] leading-relaxed text-slate-500">{s.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={120} className="mt-6">
            <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-slate-900 px-6 py-6 sm:flex-row sm:items-center sm:px-8">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                  <Clock className="h-4 w-4" />
                </span>
                <p className="text-[14px] leading-relaxed text-slate-300">
                  <span className="font-bold text-white">Your details are remembered on this device.</span>{" "}
                  The next request only needs the patient and the tests.
                </p>
              </div>
              <button
                type="button"
                onClick={scrollToPicker}
                className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13.5px] font-bold text-slate-900 transition-transform hover:scale-[1.03]"
              >
                Send one now
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Audiences ──────────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-medical-600">Built for the whole chain</span>
            <h2 className="mt-3 text-[28px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-[40px]">
              One request, four points of view
            </h2>
          </Reveal>

          {/* Tab rail */}
          <Reveal delay={60} className="mt-8">
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {AUDIENCES.map((a, i) => {
                const Icon = a.icon;
                const on = i === audience;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAudience(i)}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-semibold transition-all ${
                      on
                        ? "border-slate-900 bg-slate-900 text-white shadow-md"
                        : "border-stone-200/90 bg-white/70 text-slate-600 hover:border-stone-300 hover:bg-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {a.eyebrow}
                  </button>
                );
              })}
            </div>
          </Reveal>

          {/* Panel */}
          <Reveal delay={100} className="mt-5">
            <div key={active.id} id={active.id} className="animate-fade-in-up scroll-mt-28 overflow-hidden rounded-[28px] border border-stone-200/80 bg-white/80 backdrop-blur">
              <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="p-7 sm:p-10">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${active.chip}`}>
                    <ActiveIcon className="h-3.5 w-3.5" />
                    {active.eyebrow}
                  </span>
                  <h3 className="mt-4 text-[24px] font-black leading-tight tracking-tight text-slate-900 sm:text-[30px]">
                    {active.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-slate-500">{active.body}</p>

                  <div className="mt-7 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={scrollToPicker}
                      className="group inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-[14px] font-bold text-white transition-all hover:bg-slate-800"
                    >
                      Start a request
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <Link
                      href={active.href}
                      className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-[14px] font-semibold text-slate-700 transition-colors hover:border-stone-300"
                    >
                      {active.hrefLabel}
                    </Link>
                  </div>
                </div>

                <div className={`relative bg-gradient-to-br ${active.accent} p-7 sm:p-10`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.28),transparent_55%)]" aria-hidden="true" />
                  <ul className="relative space-y-3.5">
                    {active.points.map((p, i) => (
                      <li
                        key={p}
                        className="animate-fade-in-up flex items-start gap-3 rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm"
                        style={{ animationDelay: `${i * 70}ms` }}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/90 text-slate-900">
                          <Check className="h-3 w-3" strokeWidth={3.5} />
                        </span>
                        <span className="text-[13.5px] font-medium leading-relaxed text-white">{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" className="scroll-mt-28 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal className="max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-medical-600">What&apos;s inside</span>
            <h2 className="mt-3 text-[28px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-[40px]">
              Small things that remove whole steps
            </h2>
          </Reveal>

          <div className="mt-11 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={(i % 4) * 70} className="h-full">
                  <div className="group h-full rounded-3xl border border-stone-200/80 bg-white/75 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-medical-200 hover:bg-white hover:shadow-[0_26px_46px_-30px_rgba(2,112,195,0.6)]">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-medical-50 text-medical-600 ring-1 ring-medical-100 transition-colors group-hover:bg-medical-600 group-hover:text-white group-hover:ring-medical-600">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <h3 className="mt-4 text-[15px] font-bold tracking-tight text-slate-900">{f.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{f.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Care plan ──────────────────────────────────────────────────── */}
      <section id="care-plan" className="scroll-mt-28 px-4 py-16 sm:py-24">
        <Reveal className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[28px] border border-stone-200/70 bg-gradient-to-br from-medical-50/70 via-white to-emerald-50/50">
            <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-medical-100 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-medical-600">
                  <HeartPulse className="h-3.5 w-3.5" />
                  Care plan
                </span>
                <h2 className="mt-4 text-[28px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-[38px]">
                  Hypertension and diabetes cost less to manage here
                </h2>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">
                  One yearly payment covers the two things that never stop: the tests and the
                  medication. Your care code takes money off both at partner labs and pharmacies —
                  and comes with a doctor you can write to, without booking anything.
                </p>

                <ul className="mt-7 space-y-3.5">
                  <CareLine icon={FlaskConical} title="Cheaper monitoring">
                    BP checks, HbA1c, fasting glucose, kidney and lipid panels — discounted every
                    time, at any partner laboratory.
                  </CareLine>
                  <CareLine icon={Pill} title="Cheaper medication">
                    The discount applies to the prescriptions that keep you steady — amlodipine,
                    lisinopril, metformin, insulin, test strips — at every partner pharmacy.
                  </CareLine>
                  <CareLine icon={MessageSquareText} title="A doctor, in writing">
                    Assigned to you for the year. Send a reading or a question and get a considered
                    reply — no appointment, no waiting room.
                  </CareLine>
                </ul>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/consults"
                    className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-medical-600 px-6 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-medical-700 active:scale-[0.98]"
                  >
                    See the care plan
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    href="/pharmacies"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-slate-700 transition-colors hover:border-stone-300"
                  >
                    <Pill className="h-4 w-4 text-emerald-600" />
                    Find a partner pharmacy
                  </Link>
                </div>
              </div>

              {/* The card, roughly as a member sees it */}
              <div className="flex items-center justify-center">
                <div className="w-full max-w-sm space-y-3">
                  <div className="rounded-3xl bg-gradient-to-br from-medical-600 to-medical-800 p-5 text-white shadow-[0_30px_60px_-35px_rgba(2,112,195,0.9)]">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
                          Poveon Care Plan
                        </p>
                        <p className="mt-1 text-base font-bold">Your care code</p>
                      </div>
                      <PoveonLogo className="h-5 w-5 opacity-60" />
                    </div>
                    <p className="mt-5 font-mono text-2xl font-extrabold tracking-[0.2em]">PVC-••••••</p>
                    <p className="mt-4 text-[11px] text-white/70">
                      Show it at the counter. That&apos;s the whole process.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat label="Off lab tests" value="15%" />
                    <MiniStat label="Off prescriptions" value="10%" />
                  </div>
                  <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-4">
                    <p className="text-[13px] leading-relaxed text-slate-600">
                      <span className="font-bold text-slate-800">Are you a pharmacy?</span> Join the
                      network, honour the code, and keep the customers who refill every month.{" "}
                      <Link href="/pharmacy-login" className="font-semibold text-medical-600 hover:underline">
                        Pharmacy portal →
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Security ───────────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:py-20">
        <Reveal className="mx-auto max-w-6xl">
          <div className="overflow-hidden rounded-[28px] bg-slate-900 px-6 py-10 sm:px-10 sm:py-12">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" /> Security
                </span>
                <h2 className="mt-4 text-[26px] font-black leading-tight tracking-tight text-white sm:text-[34px]">
                  Patient data is handled like patient data
                </h2>
                <p className="mt-4 text-[14.5px] leading-relaxed text-slate-300">
                  Requests are scoped to the lab they name, staff access is role-based, and every stage of a sample&apos;s
                  journey is timestamped for audit.
                </p>
                <Link
                  href="/security"
                  className="group mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-[14px] font-bold text-slate-900 transition-transform hover:scale-[1.03]"
                >
                  Read the security overview
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {SECURITY.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={s.title}
                      className="animate-fade-in-up rounded-2xl border border-white/10 bg-white/[0.06] p-5"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <h3 className="mt-3.5 text-[14px] font-bold text-white">{s.title}</h3>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-400">{s.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <Reveal className="text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-medical-600">Questions</span>
            <h2 className="mt-3 text-[28px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-[36px]">
              Before you send the first one
            </h2>
          </Reveal>

          <div className="mt-9 space-y-2.5">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <FaqItem q={f.q} a={f.a} defaultOpen={i === 0} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────────────── */}
      <section className="px-4 pb-20 pt-4 sm:pb-28">
        <Reveal className="mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-[32px] border border-stone-200/70 bg-gradient-to-br from-white via-[#FDF9F0] to-medical-50/60 px-6 py-12 text-center shadow-[0_30px_70px_-40px_rgba(15,23,42,0.5)] sm:px-12 sm:py-16">
            <div className="animate-aurora pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-medical-300/25 blur-3xl" aria-hidden="true" />
            <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg">
              <PoveonLogo className="h-6 w-6" />
            </span>
            <h2 className="relative mt-6 text-[28px] font-black leading-tight tracking-[-0.02em] text-slate-900 sm:text-[38px]">
              Your patient is waiting. The form isn&apos;t.
            </h2>
            <p className="relative mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-500">
              Pick a laboratory and send a real request in the next minute — nothing to install, nothing to sign up for.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={scrollToPicker}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-7 py-4 text-[15px] font-bold text-white transition-all hover:bg-slate-800 active:scale-[0.98] sm:w-auto"
              >
                Choose your lab
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-7 py-4 text-[15px] font-semibold text-slate-700 transition-colors hover:border-stone-300 sm:w-auto"
              >
                Partner your lab with us
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200/70 bg-white/50 px-4 py-14 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Link href="/" className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900">
                  <PoveonLogo className="h-5 w-5 text-white" />
                </span>
                <span className="text-[16px] font-bold tracking-tight text-slate-900">Poveon</span>
              </Link>
              <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-slate-500">
                Laboratory requests, results and everything between — for clinicians, patients, laboratories and hospitals.
              </p>
              <p className="mt-4 flex items-center gap-1.5 text-[12px] text-slate-400">
                <MapPin className="h-3.5 w-3.5" /> Nigeria
              </p>
            </div>

            <FooterCol
              title="Platform"
              links={[
                { href: "/#how-it-works", label: "How it works" },
                { href: "/#features", label: "Features" },
                { href: "/#choose-lab", label: "Find a lab" },
                { href: "/refer", label: "Refer a patient" },
                { href: "/consults", label: "Care plan" },
                { href: "/pharmacies", label: "Partner pharmacies" },
              ]}
            />
            <FooterCol
              title="Portals"
              links={[
                { href: "/lab-login", label: "Laboratory" },
                { href: "/doc-login", label: "Medical professional" },
                { href: "/login", label: "Patient" },
                { href: "/hospital-login", label: "Hospital" },
                { href: "/pharmacy-login", label: "Pharmacy" },
              ]}
            />
            <FooterCol
              title="Company"
              links={[
                { href: "/about", label: "About" },
                { href: "/contact", label: "Contact" },
                { href: "/security", label: "Security" },
                { href: "/api-docs", label: "API docs" },
              ]}
            />
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-stone-200/70 pt-6 sm:flex-row">
            <p className="text-[12px] text-slate-400">© {new Date().getFullYear()} Poveon. All rights reserved.</p>
            <div className="flex items-center gap-5 text-[12px] text-slate-400">
              <Link href="/terms" className="transition-colors hover:text-slate-700">Terms</Link>
              <Link href="/privacy" className="transition-colors hover:text-slate-700">Privacy</Link>
              <Link href="/api-docs" className="inline-flex items-center gap-1 transition-colors hover:text-slate-700">
                <Code2 className="h-3 w-3" /> Developers
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* The lab's request form, on its own headed paper */}
      <LabFormModal lab={activeLab} open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function CareLine({
  icon: Icon, title, children,
}: {
  icon: typeof HeartPulse; title: string; children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-medical-600 ring-1 ring-medical-100">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold tracking-tight text-slate-900">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{children}</p>
      </div>
    </li>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 text-center">
      <p className="text-xl font-black text-slate-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-[13px] text-slate-600 transition-colors hover:text-medical-700">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
