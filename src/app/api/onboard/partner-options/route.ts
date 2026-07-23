export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/onboard/partner-options?lab_id=… | lab_slug=…
 *
 * Name lists for the self-registration form's searchable dropdowns:
 * - hospitals — the lab's hospital/company partners plus Poveon's hospital directory
 * - hmos — the lab's HMO partners plus Poveon's HMO directory
 *
 * Public (the QR form is used by anonymous patients); returns names only.
 * The lab's own partners are listed first so a patient's most likely
 * referrer is at the top before they start typing.
 */
export async function GET(req: NextRequest) {
  const labId = req.nextUrl.searchParams.get("lab_id");
  const labSlug = req.nextUrl.searchParams.get("lab_slug");
  if (!labId && !labSlug) {
    return NextResponse.json({ success: false, error: "lab_id or lab_slug required" }, { status: 400 });
  }

  const lab = labId
    ? await prisma.lab.findUnique({ where: { id: labId }, select: { id: true } })
    : await prisma.lab.findUnique({ where: { slug: labSlug! }, select: { id: true } });
  if (!lab) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

  const [partners, hospitals, hmos] = await Promise.all([
    prisma.labPartner.findMany({
      where: { lab_id: lab.id, is_active: true },
      select: { type: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.hospital.findMany({ where: { is_active: true }, select: { name: true }, orderBy: { name: "asc" } }).catch(() => []),
    prisma.hmo.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: "asc" } }).catch(() => []),
  ]);

  // Lab partners first, then the platform directory — deduped case-insensitively.
  function merge(first: string[], rest: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const name of [...first, ...rest]) {
      const n = name.trim();
      const key = n.toLowerCase();
      if (!n || seen.has(key)) continue;
      seen.add(key);
      out.push(n);
    }
    return out;
  }

  const hospitalPartners = partners.filter((p) => p.type === "hospital" || p.type === "company").map((p) => p.name);
  const hmoPartners = partners.filter((p) => p.type === "hmo").map((p) => p.name);

  return NextResponse.json({
    success: true,
    hospitals: merge(hospitalPartners, hospitals.map((h) => h.name)),
    hmos: merge(hmoPartners, hmos.map((h) => h.name)),
  });
}
