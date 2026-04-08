export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/kb/sync
 * Scans all active LabOfferedTest records and upserts KbTest entries for
 * any canonical names not yet in the knowledge base.
 * Merges synonyms from all lab tests with the same normalized raw_name.
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const mode: "new_only" | "merge_synonyms" = body.mode ?? "new_only";

  // Load all active lab tests
  const labTests = await prisma.labOfferedTest.findMany({
    where: { is_active: true },
    select: { raw_name: true, synonyms: true, category_label: true },
  });

  // Group by normalized raw_name
  const grouped = new Map<string, { raw_name: string; synonyms: string[]; category: string | null }>();
  for (const t of labTests) {
    const key = t.raw_name.toLowerCase().trim();
    if (!grouped.has(key)) {
      grouped.set(key, { raw_name: t.raw_name, synonyms: [t.raw_name], category: t.category_label });
    }
    const entry = grouped.get(key)!;
    const syns = Array.isArray(t.synonyms) ? t.synonyms as string[] : [];
    for (const s of syns) {
      if (!entry.synonyms.includes(s)) entry.synonyms.push(s);
    }
    if (!entry.category && t.category_label) entry.category = t.category_label;
  }

  // Load existing KB
  const existingKb = await prisma.kbTest.findMany({ select: { id: true, canonical_name: true, synonyms: true } });
  const existingNames = new Set(existingKb.map((k: { canonical_name: string }) => k.canonical_name.toLowerCase().trim()));

  let created = 0, merged = 0;

  for (const entry of Array.from(grouped.values())) {
    const key = entry.raw_name.toLowerCase().trim();
    const alreadyExists = existingNames.has(key);

    if (!alreadyExists) {
      await prisma.kbTest.create({
        data: {
          canonical_name: entry.raw_name,
          synonyms: entry.synonyms,
          category: entry.category,
        },
      });
      created++;
    } else if (mode === "merge_synonyms") {
      const existing = existingKb.find((k: { canonical_name: string }) => k.canonical_name.toLowerCase().trim() === key);
      if (existing) {
        const existingSyns: string[] = Array.isArray(existing.synonyms) ? existing.synonyms as string[] : [];
        const mergedSyns = [...existingSyns];
        for (const s of entry.synonyms) {
          if (!mergedSyns.includes(s)) mergedSyns.push(s);
        }
        if (mergedSyns.length !== existingSyns.length) {
          await prisma.kbTest.update({
            where: { id: existing.id },
            data: { synonyms: mergedSyns },
          });
          merged++;
        }
      }
    }
  }

  return NextResponse.json({ success: true, created, merged, total_scanned: grouped.size });
}
