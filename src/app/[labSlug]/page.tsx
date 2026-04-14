import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";
import { LabSplash } from "@/components/LabSplash";
import { LabPageContent } from "@/components/LabPageContent";

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
      logo_url: true, hero_image_url: true, service_categories: true,
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
    phones: (lab.phones ?? []) as unknown as import("@/lib/phones").PhoneEntry[],
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
      phones: (b.branch_lab!.phones ?? []) as unknown as import("@/lib/phones").PhoneEntry[],
      whatsapp: b.branch_lab!.whatsapp ?? null,
      logo_url: b.branch_lab!.logo_url ?? null,
      is_main: b.is_main,
      is_parent: false,
    }));

  const locations = [parentLocation, ...branchLocations];
  const logoUrl = lab.logo_url ?? null;
  const heroImageUrl = lab.hero_image_url ?? null;

  return (
    <div className="relative h-dvh flex flex-col bg-slate-50 overflow-hidden">
      {/* Branded background — logo blur wash or soft gradient (no hero image at page level) */}
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
      <div className="absolute inset-0 -z-10 bg-white/30 pointer-events-none" aria-hidden="true" />

      {/* Branded splash */}
      <LabSplash logoUrl={logoUrl} labName={lab.name} />

      {/* Scrollable content area — regular scroll so sticky hero can collapse properly */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <LabPageContent
          labId={lab.id}
          labName={lab.name}
          labAddress={lab.address}
          labServiceCategories={(lab.service_categories as string[]) ?? []}
          labPhones={lab.phones}
          labWhatsapp={lab.whatsapp ?? null}
          logoUrl={logoUrl}
          heroImageUrl={heroImageUrl}
          locations={locations}
        />

        <div className="w-full border-t border-slate-100/60 mt-4">
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
