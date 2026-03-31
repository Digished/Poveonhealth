import { DoctorRequestForm } from "@/components/DoctorRequestForm";
import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  // Fetch labs at SSR time — data arrives with the HTML, search modal is instant
  const labsData = await prisma.lab.findMany({
    where: { hidden: false, search_hidden: false },
    select: { id: true, name: true, slug: true, prefix: true, address: true, logo_url: true, phones: true, whatsapp: true },
    orderBy: { name: "asc" },
  });
  return (
    <div className="relative h-dvh flex flex-col bg-sky-50 overflow-hidden">
      {/* Full-page gradient wash — deep sky at top, pale blue through the form */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 100% 55% at 50% 0%, rgba(186,230,255,0.85) 0%, rgba(224,242,254,0.5) 50%, transparent 80%), " +
            "radial-gradient(ellipse 70% 50% at 90% 25%, rgba(199,210,254,0.45) 0%, transparent 65%), " +
            "radial-gradient(ellipse 60% 40% at 5% 70%, rgba(207,250,254,0.4) 0%, transparent 65%)",
        }}
      />

      <Navbar />

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden snap-y snap-mandatory">
        <div className="w-full snap-start snap-always">
          <HeroSection />
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-2 snap-start snap-always">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <DoctorRequestForm initialLabs={labsData as any} />
        </div>

        {/* Trust indicators strip */}
        <div className="w-full border-t border-sky-100/60 bg-sky-50/40 mt-4">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <TrustIndicators />
          </div>
        </div>

        {/* Compact footer */}
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
