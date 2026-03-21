import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";

interface LabSlugPageProps {
  params: { labSlug: string };
}

export default async function LabSlugPage({ params }: LabSlugPageProps) {
  const lab = await prisma.lab.findUnique({
    where: { slug: params.labSlug },
    select: { id: true, name: true, hidden: true },
  });

  if (!lab || lab.hidden) {
    notFound();
  }

  return (
    <div className="h-dvh flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 overflow-hidden">
      {/* Scrollable content area — page never scrolls, only this div does */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-4 pb-2">
          {/* Lab name banner */}
          <div className="mt-6 mb-4 rounded-xl bg-white/60 backdrop-blur-sm border border-blue-100 px-4 py-3 text-center shadow-sm">
            <p className="text-sm text-slate-500 font-medium uppercase tracking-wide">
              Submitting request to
            </p>
            <p className="text-xl font-semibold text-slate-800 mt-0.5">
              {lab.name}
            </p>
          </div>

          {/*
           * NOTE: DoctorRequestForm does not yet accept `preselectedLabId` or
           * `preselectedLabName` props. These props are passed here and will be
           * wired up when DoctorRequestForm is updated to support pre-selection.
           */}
          <DoctorRequestForm
            preselectedLabId={lab.id}
            preselectedLabName={lab.name}
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
