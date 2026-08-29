import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Pill } from "lucide-react";
import { PoveonLogo } from "@/components/PoveonLogo";
import { PharmacyDirectory } from "@/components/consults/PharmacyDirectory";
import { getConsultSettings } from "@/lib/consult";

// The partner list and discount are both admin-editable.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Partner pharmacies — Poveon Care Plan",
  description:
    "Pharmacies that honour the Poveon care code for money off blood-pressure and diabetes medication. Filter by state to find one near you.",
};

export default async function PharmaciesPage() {
  const settings = await getConsultSettings();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-emerald-50/60 via-white to-sky-50">
      <nav className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <PoveonLogo className="h-6 w-6 text-medical-600" />
            <span className="text-lg font-bold text-slate-900">Poveon</span>
          </Link>
          <Link
            href="/consults"
            className="inline-flex items-center gap-1.5 rounded-xl bg-medical-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-medical-600/25 transition hover:bg-medical-700"
          >
            Get a care code
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Pill className="h-3.5 w-3.5" />
            Partner pharmacies
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
            Where your care code saves you money
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Care-plan members get <strong>{settings.pharmacy_discount_percent}% off</strong> their
            prescriptions at every pharmacy below — the blood-pressure and diabetes medication you
            refill month after month, plus test strips and monitoring supplies. Show your code at
            the counter; there&apos;s nothing else to do.
          </p>
        </div>

        <div className="mt-8">
          <PharmacyDirectory compact />
        </div>

        <div className="mt-10 rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-800">Run a pharmacy?</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Join the network and keep the customers who come back every month for the same
            prescription.
          </p>
          <Link
            href="/pharmacy-login"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
          >
            Pharmacy portal
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Poveon. Discounts apply to care-plan members only.
      </footer>
    </div>
  );
}
