import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";
import { LabSplash } from "@/components/LabSplash";
import { LabPageNav } from "@/components/LabPageNav";
import { LabHeroSection } from "@/components/LabHeroSection";

interface LabSlugPageProps {
  params: { labSlug: string };
}

export default async function LabSlugPage({ params }: LabSlugPageProps) {
  const lab = await prisma.lab.findUnique({
    where: { slug: params.labSlug },
    select: {
      id: true, name: true, hidden: true,
      address: true, phones: true, whatsapp: true,
      email: true, request_email: true,
      logo_url: true,
    },
  });

  if (!lab || lab.hidden) {
    notFound();
  }

  // Fetch branches: get each branch's full lab data for proper routing
  const branchLinks = await prisma.labBranch.findMany({
    where: { lab_id: lab.id, branch_lab_id: { not: null } },
    include: {
      branch_lab: {
        select: { id: true, name: true, address: true, phones: true, whatsapp: true, logo_url: true },
      },
    },
    orderBy: [{ is_main: "desc" }],
  });

  const parentLocation = {
    lab_id: lab.id,
    lab_branch_id: null as string | null,
    name: lab.name,
    address: lab.address ?? "",
    phones: (lab.phones ?? []) as string[],
    whatsapp: lab.whatsapp ?? null,
    logo_url: lab.logo_url ?? null,
    is_main: false,
    is_parent: true,
  };

  const branchLocations = branchLinks
    .filter((b) => b.branch_lab !== null)
    .map((b) => ({
      lab_id: b.branch_lab!.id,
      lab_branch_id: b.id,
      name: b.branch_lab!.name,
      address: b.branch_lab!.address ?? "",
      phones: (b.branch_lab!.phones ?? []) as string[],
      whatsapp: b.branch_lab!.whatsapp ?? null,
      logo_url: b.branch_lab!.logo_url ?? null,
      is_main: b.is_main,
      is_parent: false,
    }));

  const locations = [parentLocation, ...branchLocations];
  const logoUrl = lab.logo_url ?? null;

  return (
    <div className="relative h-dvh flex flex-col bg-slate-50 overflow-hidden">
      {/* Branded background — logo colors or fallback gradient */}
      {logoUrl ? (
        <div
          className="absolute inset-0 -z-10 pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage: `url(${logoUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(80px) saturate(2.5) brightness(1.1)",
            opacity: 0.22,
            transform: "scale(1.4)",
          }}
        />
      ) : (
        <div
          className="absolute inset-0 -z-10 pointer-events-none"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 50% at 25% 0%, rgba(224,242,254,0.7) 0%, transparent 70%), " +
              "radial-gradient(ellipse 60% 45% at 90% 30%, rgba(224,231,255,0.5) 0%, transparent 65%), " +
              "radial-gradient(ellipse 55% 50% at 5% 90%, rgba(240,253,244,0.6) 0%, transparent 65%)",
          }}
        />
      )}
      {/* Lighter veil so brand colours actually show through */}
      <div className="absolute inset-0 -z-10 bg-white/30 pointer-events-none" aria-hidden="true" />

      {/* Branded splash */}
      <LabSplash logoUrl={logoUrl} labName={lab.name} />

      {/*
        LabPageNav sits OUTSIDE <main> as a flex-column sibling.
        When the hero is visible its max-h is 0 (no space taken).
        When the hero scrolls away it grows to ~52 px, shrinking main
        automatically — so the form's sticky top-0 header lands right
        below the nav with zero overlap and no extra props needed.
      */}
      <LabPageNav labName={lab.name} logoUrl={logoUrl} />

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden snap-y snap-mandatory">
        <div className="max-w-2xl mx-auto snap-start snap-always">
          <LabHeroSection labName={lab.name} logoUrl={logoUrl} />
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-2 snap-start snap-always">
          <DoctorRequestForm
            preselectedLabId={lab.id}
            preselectedLabName={lab.name}
            locations={locations}
          />
        </div>

        <div className="w-full border-t border-white/60 bg-white/30 backdrop-blur-sm mt-4">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <TrustIndicators />
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-4 text-xs text-slate-400">
          <PoveonLogo className="w-5 h-5 opacity-40" />
          <span>© {new Date().getFullYear()} Poveon.</span>
          <a href="/terms" className="hover:text-slate-600 transition-colors">Terms</a>
          <a href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</a>
          <a href="/api-docs" className="hover:text-slate-600 transition-colors">API Docs</a>
        </div>
      </main>
    </div>
  );
}
