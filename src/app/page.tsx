import type { Metadata } from "next";
import { LandingPage, type LandingStats } from "@/components/home/LandingPage";
import type { LandingLab } from "@/components/home/LabPicker";
import { STATE_NAMES } from "@/lib/nigeria-locations";
import { prisma } from "@/lib/prisma";

// Render per-request — querying the database during static prerender makes
// `next build` fail whenever the DB is unreachable from the build container
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Poveon — send a lab request in a minute flat",
  description:
    "Choose a partner laboratory and its request form opens right here. Clinicians and patients can send lab test requests with no account — the lab is notified instantly.",
  openGraph: {
    title: "Poveon — send a lab request in a minute flat",
    description:
      "Choose a partner laboratory and its request form opens right here. No account, no fax, no chasing results.",
    type: "website",
  },
};

export default async function HomePage() {
  // Labs arrive with the HTML so the picker is usable on first paint.
  let labs: LandingLab[] = [];
  let stats: LandingStats = { labs: 0, catalogTests: 0, states: 0, requests: 0 };

  try {
    [labs, stats] = await Promise.all([fetchLabs(), fetchStats()]);
  } catch (err) {
    console.error("[home] failed to load landing data:", err instanceof Error ? err.message : err);
  }

  return <LandingPage labs={labs} stats={stats} />;
}

async function fetchLabs(): Promise<LandingLab[]> {
  const rows = await prisma.lab.findMany({
    where: { hidden: false, search_hidden: false },
    select: {
      id: true, name: true, slug: true, address: true,
      logo_url: true, phones: true, whatsapp: true, service_categories: true,
    },
    orderBy: { name: "asc" },
  });

  type Row = (typeof rows)[number];
  return rows.map((l: Row) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    address: l.address ?? "",
    logo_url: l.logo_url ?? null,
    phones: l.phones,
    whatsapp: l.whatsapp ?? null,
    service_categories: (l.service_categories as string[] | null) ?? [],
  }));
}

/**
 * Live figures for the stats strip. Every number is counted from the database
 * on each request — nothing here is a marketing round-up.
 */
async function fetchStats(): Promise<LandingStats> {
  const [labCount, catalogTests, requests, addresses] = await Promise.all([
    prisma.lab.count({ where: { hidden: false } }),
    prisma.labOfferedTest.count(),
    prisma.request.count(),
    prisma.lab.findMany({ where: { hidden: false }, select: { address: true } }),
  ]);

  // States covered = the distinct Nigerian states named in partner lab addresses.
  const states = new Set<string>();
  for (const { address } of addresses) {
    if (!address) continue;
    const haystack = address.toLowerCase();
    for (const state of STATE_NAMES) {
      if (haystack.includes(state.toLowerCase())) states.add(state);
    }
  }

  return { labs: labCount, catalogTests, requests, states: states.size };
}
