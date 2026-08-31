import type { Metadata } from "next";
import { LandingPage, type LandingStats } from "@/components/home/LandingPage";
import type { LandingLab } from "@/components/home/LabPicker";
import { unstable_cache } from "next/cache";
import { STATE_NAMES } from "@/lib/nigeria-locations";
import { prisma } from "@/lib/prisma";

// Render per-request — querying the database during static prerender makes
// `next build` fail whenever the DB is unreachable from the build container
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Poveon — manage hypertension and diabetes for one payment a year",
  description:
    "One yearly payment gets a care code that takes money off tests at partner labs and medication at partner pharmacies, plus a doctor assigned to you for the year. Clinicians can still send a lab request here with no account.",
  openGraph: {
    title: "Poveon — manage hypertension and diabetes for one payment a year",
    description:
      "A care code that takes money off your tests and your medication, and a doctor who answers in writing. No appointment, no waiting room.",
    type: "website",
  },
};

export default async function HomePage() {
  // Labs arrive with the HTML so the picker is usable on first paint.
  let labs: LandingLab[] = [];
  let stats: LandingStats = { labs: 0, catalogTests: 0, states: 0, requests: 0 };

  try {
    ({ labs, stats } = await getLandingData());
  } catch (err) {
    console.error("[home] failed to load landing data:", err instanceof Error ? err.message : err);
  }

  return <LandingPage labs={labs} stats={stats} />;
}

/**
 * Labs + live figures for the landing page, cached for five minutes.
 *
 * The page is dynamic (it must not be prerendered at build time), but the data
 * behind it changes rarely — without this cache every visit, crawl and refresh
 * ran four queries against the database.
 */
const getLandingData = unstable_cache(
  async (): Promise<{ labs: LandingLab[]; stats: LandingStats }> => {
    const [labRows, catalogTests, requests] = await Promise.all([
      prisma.lab.findMany({
        where: { hidden: false, search_hidden: false },
        select: {
          id: true, name: true, slug: true, address: true,
          logo_url: true, phones: true, whatsapp: true, service_categories: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.labOfferedTest.count(),
      prisma.request.count(),
    ]);

    type Row = (typeof labRows)[number];
    const labs: LandingLab[] = labRows.map((l: Row) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      address: l.address ?? "",
      logo_url: l.logo_url ?? null,
      phones: l.phones,
      whatsapp: l.whatsapp ?? null,
      service_categories: (l.service_categories as string[] | null) ?? [],
    }));

    // States covered = the distinct Nigerian states named in partner addresses.
    const states = new Set<string>();
    for (const lab of labs) {
      if (!lab.address) continue;
      const haystack = lab.address.toLowerCase();
      for (const state of STATE_NAMES) {
        if (haystack.includes(state.toLowerCase())) states.add(state);
      }
    }

    return { labs, stats: { labs: labs.length, catalogTests, requests, states: states.size } };
  },
  ["landing-page-data"],
  { revalidate: 300, tags: ["landing-page-data"] }
);
