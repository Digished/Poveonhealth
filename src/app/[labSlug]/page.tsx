import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";
import { LabSplash } from "@/components/LabSplash";
import { LabPageNav } from "@/components/LabPageNav";

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
        select: { id: true, name: true, address: true, phones: true, whatsapp: true },
      },
    },
    orderBy: [{ is_main: "desc" }],
  });

  // Parent lab is always the first location option
  const parentLocation = {
    lab_id: lab.id,
    lab_branch_id: null as string | null,
    name: lab.name,
    address: lab.address ?? "",
    phones: (lab.phones ?? []) as string[],
    whatsapp: lab.whatsapp ?? null,
    is_main: false,
    is_parent: true,
  };

  // Each branch link points to an independent lab — use that lab's own contact info
  const branchLocations = branchLinks
    .filter((b) => b.branch_lab !== null)
    .map((b) => ({
      lab_id: b.branch_lab!.id,
      lab_branch_id: b.id,
      name: b.branch_lab!.name,
      address: b.branch_lab!.address ?? "",
      phones: (b.branch_lab!.phones ?? []) as string[],
      whatsapp: b.branch_lab!.whatsapp ?? null,
      is_main: b.is_main,
      is_parent: false,
    }));

  // All selectable locations: parent first, then branches sorted by is_main desc
  const locations = [parentLocation, ...branchLocations];

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 overflow-hidden">
      {/* Branded splash — fades out after ~1.6 s */}
      <LabSplash logoUrl={lab.logo_url ?? null} labName={lab.name} />

      {/* Scrollable content area — page never scrolls, only this div does */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Lab-branded nav with login */}
        <LabPageNav labName={lab.name} logoUrl={lab.logo_url} />

        <div className="max-w-2xl mx-auto px-4 pb-2">
          <DoctorRequestForm
            preselectedLabId={lab.id}
            preselectedLabName={lab.name}
            locations={locations}
          />
        </div>

        {/* Full-width trust indicators strip */}
        <div className="w-full border-t border-white/60 bg-white/30 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <TrustIndicators />
          </div>
        </div>

        {/* Compact inline footer */}
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
