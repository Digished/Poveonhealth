export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** GET /api/admin/kb — list all KB tests with lab coverage stats */
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase();

  const kbTests = await prisma.kbTest.findMany({
    where: q ? { canonical_name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: [{ category: "asc" }, { canonical_name: "asc" }],
  });

  // Aggregate lab coverage from LabOfferedTest synonyms
  const allLabTests = await prisma.labOfferedTest.findMany({
    where: { is_active: true },
    select: {
      id: true, raw_name: true, synonyms: true, lab_price: true, poveon_fee: true,
      lab: { select: { id: true, name: true } },
    },
  });

  // Build normalized name → lab list map
  const labsByNormName = new Map<string, { lab_id: string; lab_name: string; price: number }[]>();
  for (const t of allLabTests) {
    const synonyms = Array.isArray(t.synonyms) ? t.synonyms as string[] : [t.raw_name];
    for (const s of synonyms) {
      const key = s.toLowerCase().trim();
      if (!labsByNormName.has(key)) labsByNormName.set(key, []);
      labsByNormName.get(key)!.push({
        lab_id: t.lab.id,
        lab_name: t.lab.name,
        price: Number(t.lab_price),
      });
    }
  }

  const tests = kbTests.map((kb) => {
    const syns = Array.isArray(kb.synonyms) ? kb.synonyms as string[] : [];
    // Collect unique labs offering any synonym of this KB test
    const labSet = new Map<string, { lab_id: string; lab_name: string; price: number }>();
    for (const s of [kb.canonical_name, ...syns]) {
      const matches = labsByNormName.get(s.toLowerCase().trim()) ?? [];
      for (const m of matches) {
        if (!labSet.has(m.lab_id)) labSet.set(m.lab_id, m);
      }
    }
    return {
      id: kb.id,
      canonical_name: kb.canonical_name,
      synonyms: syns,
      category: kb.category,
      description: kb.description,
      created_at: kb.created_at,
      updated_at: kb.updated_at,
      lab_count: labSet.size,
      labs: Array.from(labSet.values()),
    };
  });

  // Stats
  const total_kb = kbTests.length;
  const total_lab_tests = allLabTests.length;
  const total_labs = new Set(allLabTests.map((t) => t.lab.id)).size;

  return NextResponse.json({ success: true, tests, stats: { total_kb, total_lab_tests, total_labs } });
}

/** POST /api/admin/kb — create a new KB test */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { canonical_name, synonyms, category, description } = await req.json();
  if (!canonical_name?.trim()) return NextResponse.json({ error: "canonical_name required" }, { status: 400 });

  try {
    const test = await prisma.kbTest.create({
      data: {
        canonical_name: canonical_name.trim(),
        synonyms: Array.isArray(synonyms) ? synonyms : [],
        category: category?.trim() || null,
        description: description?.trim() || null,
      },
    });
    return NextResponse.json({ success: true, test });
  } catch {
    return NextResponse.json({ error: "Already exists or invalid data" }, { status: 409 });
  }
}
