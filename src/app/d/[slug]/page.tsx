import Link from "next/link";
import { notFound } from "next/navigation";
import { PoveonLogo } from "@/components/PoveonLogo";
import { prisma } from "@/lib/prisma";
import { getDoctorPatientCount, isEncounterReady, priceForPlan } from "@/lib/doctor-encounter";
import { EncounterFlow } from "@/components/encounter/EncounterFlow";

export const dynamic = "force-dynamic";

async function loadDoctor(slug: string) {
  const profile = await prisma.doctorProfile.findUnique({ where: { encounter_slug: slug.toLowerCase() } });
  if (!profile) return null;
  const patientCount = await getDoctorPatientCount(profile.email);
  return {
    profile,
    ready: isEncounterReady(profile),
    patientCount,
    pricing: {
      single: priceForPlan(profile, "single"),
      monthly: priceForPlan(profile, "monthly"),
      yearly: priceForPlan(profile, "yearly"),
    },
  };
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = await loadDoctor(params.slug);
  const name = data ? [data.profile.prefix, data.profile.full_name].filter(Boolean).join(" ").trim() : "";
  return {
    title: name ? `Consult ${name} — Poveon Health` : "Consult — Poveon Health",
    description: "Answer a few quick questions, share photos if helpful, and get reviewed by your doctor. Private and secure.",
  };
}

export default async function DoctorEncounterPage({ params }: { params: { slug: string } }) {
  const data = await loadDoctor(params.slug);
  if (!data) notFound();

  const { profile, ready, patientCount, pricing } = data;
  const doctorName = [profile.prefix, profile.full_name].filter(Boolean).join(" ").trim() || "Your doctor";

  return (
    <div className="min-h-dvh bg-gradient-to-br from-sky-50 via-indigo-50 to-emerald-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-white/60 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <PoveonLogo className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 leading-tight truncate">Poveon Health</p>
              <p className="text-[11px] text-slate-400 leading-tight">Secure consultation</p>
            </div>
          </Link>
          <span className="text-[11px] font-medium text-slate-400 shrink-0">Private &amp; secure</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4">
        {ready ? (
          <EncounterFlow
            slug={params.slug.toLowerCase()}
            doctorName={doctorName}
            specialty={profile.specialty}
            hospitals={profile.hospitals ?? []}
            patientCount={patientCount}
            pricing={pricing}
          />
        ) : (
          <div className="py-24 text-center animate-fade-in">
            <p className="text-lg font-bold text-slate-700">{doctorName} isn&apos;t accepting requests yet</p>
            <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
              This doctor hasn&apos;t finished setting up their consultation page. Please check back soon.
            </p>
            <Link href="/" className="inline-block mt-6 text-sm font-semibold text-medical-600 hover:text-medical-700">
              Go to Poveon Health →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
