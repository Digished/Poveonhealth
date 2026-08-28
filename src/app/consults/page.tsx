import type { Metadata } from "next";
import Link from "next/link";
import {
  HeartPulse, Droplet, MessageSquareText, Target, FlaskConical, Pill,
  ShieldCheck, ArrowRight, Check,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { CarePlanSignup } from "@/components/consults/CarePlanSignup";
import { getConsultSettings } from "@/lib/consult";

// Pricing is admin-editable, so the page must not be baked at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Poveon Care Plan — a year of care for hypertension and diabetes",
  description:
    "One yearly payment. Discounts on lab tests and prescriptions, and your own doctor a message away — for people living with hypertension or diabetes.",
  openGraph: {
    title: "Poveon Care Plan — a year of care for hypertension and diabetes",
    description: "Discounted tests and prescriptions, and your own doctor a message away.",
    type: "website",
  },
};

const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;

export default async function ConsultsPage() {
  const settings = await getConsultSettings();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-white to-emerald-50/60">
      {/* Nav */}
      <nav className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <PoveonLogo className="h-6 w-6 text-medical-600" />
            <span className="text-lg font-bold text-slate-900">Poveon</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/consults/login"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Member sign in
            </Link>
            <a
              href="#join"
              className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-medical-600/25 transition hover:bg-medical-700"
            >
              Join
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero + sign-up, side by side once there's room */}
      <section className="mx-auto max-w-6xl px-4 py-10 lg:py-16">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,520px)] lg:gap-14">
          <div className="space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-medical-100 bg-medical-50 px-3 py-1 text-xs font-semibold text-medical-700">
                <HeartPulse className="h-3.5 w-3.5" />
                For hypertension &amp; diabetes
              </span>
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                A year of care for{" "}
                <span className="text-medical-600">{naira(settings.price_naira)}</span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-600">
                Living with high blood pressure or diabetes shouldn&apos;t mean guessing between
                appointments. One yearly payment gets you cheaper tests, cheaper prescriptions, and a
                doctor who knows your name and your goal.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Benefit
                icon={<FlaskConical className="h-5 w-5" />}
                value={`${settings.lab_discount_percent}% off`}
                label="Lab tests at partner labs"
              />
              <Benefit
                icon={<Pill className="h-5 w-5" />}
                value={`${settings.pharmacy_discount_percent}% off`}
                label="Prescriptions at partner pharmacies"
              />
              <Benefit
                icon={<MessageSquareText className="h-5 w-5" />}
                value={`${settings.message_allowance} messages`}
                label="To your own doctor, all year"
              />
            </div>

            <div className="space-y-5 rounded-2xl border border-slate-100 bg-white/70 p-5 backdrop-blur-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">How it works</h2>
              <Step
                n={1}
                icon={<Target className="h-4 w-4" />}
                title="Tell us your goal for the year"
                blurb="One thing you want to be true in twelve months. It's the first thing your doctor reads."
              />
              <Step
                n={2}
                icon={<ShieldCheck className="h-4 w-4" />}
                title="Pay once and get your care code"
                blurb="Show it at any partner lab or pharmacy for your discount, straight away."
              />
              <Step
                n={3}
                icon={<MessageSquareText className="h-4 w-4" />}
                title="Get matched with a doctor"
                blurb="They send you a first assessment, then you write whenever something changes — no appointments to chase."
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" />No appointment queues</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" />No monthly billing</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" />Cancel any time</span>
            </div>
          </div>

          <CarePlanSignup settings={settings} />
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-t border-slate-100 bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="text-center text-2xl font-bold text-slate-900">Built for two conditions, properly</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-slate-500">
            Hypertension and diabetes are managed over years, not visits. The plan is priced and
            designed for that.
          </p>
          <div className="mx-auto mt-8 grid max-w-3xl gap-5 sm:grid-cols-2">
            <ConditionPanel
              icon={<HeartPulse className="h-6 w-6" />}
              title="Hypertension"
              points={[
                "Cheaper BP checks and kidney panels",
                "Your readings reviewed by the same doctor",
                "Medication questions answered in writing",
              ]}
            />
            <ConditionPanel
              icon={<Droplet className="h-6 w-6" />}
              title="Diabetes"
              points={[
                "Cheaper HbA1c and fasting glucose tests",
                "Discounted prescriptions and test strips",
                "A doctor tracking your numbers against your goal",
              ]}
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 text-center">
          <div className="flex items-center gap-2">
            <PoveonLogo className="h-5 w-5 text-medical-600" />
            <span className="font-bold text-slate-700">Poveon</span>
          </div>
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Poveon. The care plan is not emergency care — call your
            nearest hospital if you need urgent help.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-500">
            <Link href="/" className="hover:text-slate-800">Home</Link>
            <Link href="/consults/login" className="hover:text-slate-800">Member sign in</Link>
            <Link href="/pharmacy-login" className="hover:text-slate-800">Pharmacy portal</Link>
            <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Benefit({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-medical-50 text-medical-600">{icon}</div>
      <p className="mt-3 text-lg font-extrabold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{label}</p>
    </div>
  );
}

function Step({ n, icon, title, blurb }: { n: number; icon: React.ReactNode; title: string; blurb: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-medical-600 text-white">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">
          <span className="mr-1.5 text-medical-500">{n}.</span>
          {title}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{blurb}</p>
      </div>
    </div>
  );
}

function ConditionPanel({ icon, title, points }: { icon: React.ReactNode; title: string; points: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-medical-50 text-medical-600">{icon}</div>
      <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
      <ul className="mt-3 space-y-2">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-slate-600">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
