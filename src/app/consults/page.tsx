import type { Metadata } from "next";
import Link from "next/link";
import {
  HeartPulse, Droplet, MessageSquareText, FlaskConical, Pill, Check, ArrowRight,
} from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { CarePlanAccountForm } from "@/components/consults/CarePlanAccountForm";
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

export default async function ConsultsPage({
  searchParams,
}: {
  searchParams?: { pharmacy?: string; lab?: string };
}) {
  const settings = await getConsultSettings();
  const price = naira(settings.price_naira);
  // Arrived by scanning a partner's QR poster: carry them through sign-up so
  // the pharmacy or lab that brought them in is already chosen.
  const partner = searchParams?.pharmacy
    ? { kind: "pharmacy" as const, code: searchParams.pharmacy }
    : searchParams?.lab
      ? { kind: "lab" as const, code: searchParams.lab }
      : null;

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-white to-emerald-50/60">
      <nav className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <PoveonLogo className="h-6 w-6 text-medical-600" />
            <span className="text-lg font-bold text-slate-900">Poveon</span>
          </Link>
          <a
            href="#join"
            className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-medical-600/25 transition hover:bg-medical-700"
          >
            Get started
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </nav>

      {/* The form is the page. Everything else is there to justify it. */}
      <section className="mx-auto max-w-6xl px-4 py-8 lg:py-14">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_minmax(0,440px)] lg:gap-14">
          <div className="space-y-7">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-medical-100 bg-medical-50 px-3 py-1 text-xs font-semibold text-medical-700">
                <HeartPulse className="h-3.5 w-3.5" />
                For hypertension &amp; diabetes
              </span>
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                A year of care for <span className="text-medical-600">{price}</span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-600">
                Living with high blood pressure or diabetes shouldn&apos;t mean guessing between
                appointments. One yearly payment covers the two costs that never stop — the tests and
                the medication — and comes with a doctor who knows your name.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Benefit
                icon={<FlaskConical className="h-5 w-5" />}
                value={`Up to ${settings.lab_discount_percent}%`}
                label="Lab tests at partner labs"
              />
              <Benefit
                icon={<Pill className="h-5 w-5" />}
                value={`Up to ${settings.pharmacy_discount_percent}%`}
                label="BP and diabetes medication at partner pharmacies"
              />
              <Benefit
                icon={<MessageSquareText className="h-5 w-5" />}
                value={`${settings.message_allowance} messages`}
                label="To your own doctor, all year"
              />
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white/70 p-5 backdrop-blur-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Three steps, about two minutes
              </h2>
              <ol className="mt-4 space-y-4">
                <Step n={1} title="Create your account" blurb="An email and a 4-digit PIN. That PIN is how you sign in from now on." />
                <Step n={2} title="Fill in the care plan" blurb="A short form on your dashboard — already filled in if we've met before." />
                <Step n={3} title="Pay and get your code" blurb="Your care code is issued the moment payment clears, and a doctor is assigned to you." />
              </ol>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" />No appointment queues</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" />No monthly billing</span>
              <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" />Cancel any time</span>
            </div>
          </div>

          {/* Sticky on desktop so the form is in reach however far you scroll */}
          <div className="lg:sticky lg:top-24">
            <CarePlanAccountForm priceLabel={price} partner={partner} />
          </div>
        </div>
      </section>

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
                "Cheaper BP checks, kidney and lipid panels",
                "Money off amlodipine, lisinopril, losartan and the rest of your regimen",
                "Your readings reviewed by the same doctor, in writing",
              ]}
            />
            <ConditionPanel
              icon={<Droplet className="h-6 w-6" />}
              title="Diabetes"
              points={[
                "Cheaper HbA1c and fasting glucose tests",
                "Money off metformin, insulin, test strips and lancets",
                "A doctor tracking your numbers month to month",
              ]}
            />
          </div>

          {/* The medication discount is the part people underestimate, so it
              gets said plainly rather than buried in a bullet. */}
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600">
                <Pill className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-emerald-900">
                  The discount covers the medication, not just the tests
                </p>
                <p className="mt-1 text-sm leading-relaxed text-emerald-800/90">
                  Your care code takes up to {settings.pharmacy_discount_percent}% off the medication you
                  refill every month at any partner pharmacy — blood-pressure tablets, diabetes
                  medication, insulin, test strips and monitoring supplies.
                </p>
                <Link
                  href="/pharmacies"
                  className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:underline"
                >
                  See partner pharmacies near you
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-10 text-center">
            <a
              href="#join"
              className="inline-flex items-center gap-2 rounded-2xl bg-medical-600 px-7 py-4 text-sm font-bold text-white shadow-lg shadow-medical-600/25 transition hover:bg-medical-700"
            >
              Create your account
              <ArrowRight className="h-4 w-4" />
            </a>
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
            <Link href="/dashboard" className="hover:text-slate-800">My dashboard</Link>
            <Link href="/pharmacies" className="hover:text-slate-800">Partner pharmacies</Link>
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

function Step({ n, title, blurb }: { n: number; title: string; blurb: string }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-medical-600 text-xs font-bold text-white">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{blurb}</p>
      </div>
    </li>
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
