import { TrustIndicators } from "@/components/TrustIndicators";
import { PoveonLogo } from "@/components/PoveonLogo";
import { Navbar } from "@/components/Navbar";
import { HomePageContent } from "@/components/HomePageContent";
import { prisma } from "@/lib/prisma";

// Render per-request — querying the database during static prerender makes
// `next build` fail whenever the DB is unreachable from the build container
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Fetch labs at SSR time — data arrives with the HTML, search modal is instant
  let labsData: Awaited<ReturnType<typeof fetchLabs>> = [];
  try {
    labsData = await fetchLabs();
  } catch (err) {
    console.error("[home] failed to load labs:", err instanceof Error ? err.message : err);
  }
  return (
    <div className="relative h-dvh flex flex-col bg-[#FAF8F3] overflow-hidden">
      {/* Full-page wash — a warm dawn glow at the top fading into soft cream,
          with the faintest sky tint. Calm and editorial. */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 110% 55% at 50% 0%, rgba(254,243,221,0.75) 0%, rgba(250,248,243,0.4) 55%, transparent 82%), " +
            "radial-gradient(ellipse 70% 48% at 88% 20%, rgba(224,242,254,0.38) 0%, transparent 66%), " +
            "radial-gradient(ellipse 60% 45% at 6% 74%, rgba(255,237,213,0.32) 0%, transparent 66%)",
        }}
      />

      <Navbar />

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden snap-y snap-mandatory">
        <HomePageContent initialLabs={labsData as any} />

        {/* Trust indicators strip */}
        <div className="w-full border-t border-stone-200/60 bg-stone-50/30 mt-6">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <TrustIndicators />
          </div>
        </div>

        {/* Compact footer */}
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-center gap-4 text-xs text-stone-400">
          <PoveonLogo className="w-5 h-5 opacity-40" />
          <span>© {new Date().getFullYear()} Poveon.</span>
          <a href="/terms" className="hover:text-stone-600 transition-colors">Terms</a>
          <a href="/privacy" className="hover:text-stone-600 transition-colors">Privacy</a>
          <a href="/api-docs" className="hover:text-stone-600 transition-colors">API Docs</a>
        </div>
      </main>
    </div>
  );
}

function fetchLabs() {
  return prisma.lab.findMany({
    where: { hidden: false, search_hidden: false },
    select: { id: true, name: true, slug: true, prefix: true, address: true, logo_url: true, phones: true, whatsapp: true, service_categories: true },
    orderBy: { name: "asc" },
  });
}
