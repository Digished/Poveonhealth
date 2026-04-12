export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

interface KbTestStats {
  total_kb: number;
  total_lab_tests: number;
  total_labs: number;
}

interface KbTestWithLabs {
  id: string;
  canonical_name: string;
  synonyms: string[];
  variants: string[];
  category: string | null;
  description: string | null;
  lab_count: number;
  labs: { lab_id: string; lab_name: string; price: number }[];
}

/**
 * GET /api/admin/test-kb-manage
 * List all TestKnowledgeBase tests with lab coverage stats
 */
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase();

    // Get all KB tests
    const kbTests = await prisma.testKnowledgeBase.findMany({
      where: {
        is_active: true,
        ...(q ? { canonical_name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ category: "asc" }, { canonical_name: "asc" }],
      include: {
        lab_test_mappings: {
          where: { is_active: true },
          select: {
            lab_id: true,
            lab: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Get all lab offered tests for pricing info
    const allLabTests = await prisma.labOfferedTest.findMany({
      where: { is_active: true },
      select: {
        id: true,
        raw_name: true,
        lab_price: true,
        lab: { select: { id: true, name: true } },
      },
    });

    // Build a map of lab → first price we find
    const labPrices = new Map<string, number>();
    for (const t of allLabTests) {
      const labId = t.lab.id;
      if (!labPrices.has(labId)) {
        labPrices.set(labId, Number(t.lab_price));
      }
    }

    const tests: KbTestWithLabs[] = kbTests.map((kb) => {
      const synonyms = (Array.isArray(kb.synonyms) ? kb.synonyms : []) as string[];
      const variants = (Array.isArray(kb.variants) ? kb.variants : []) as string[];
      const labSet = new Map<string, { lab_id: string; lab_name: string; price: number }>();

      for (const mapping of kb.lab_test_mappings) {
        if (!labSet.has(mapping.lab_id)) {
          labSet.set(mapping.lab_id, {
            lab_id: mapping.lab_id,
            lab_name: mapping.lab.name,
            price: labPrices.get(mapping.lab_id) || 0,
          });
        }
      }

      return {
        id: kb.id,
        canonical_name: kb.canonical_name,
        synonyms,
        variants,
        category: kb.category,
        description: kb.description,
        lab_count: labSet.size,
        labs: Array.from(labSet.values()),
      };
    });

    // Get stats
    const totalLabTests = await prisma.labOfferedTest.count({ where: { is_active: true } });
    const totalLabs = await prisma.lab.count();

    const stats: KbTestStats = {
      total_kb: tests.length,
      total_lab_tests: totalLabTests,
      total_labs: totalLabs,
    };

    return NextResponse.json({
      success: true,
      tests,
      stats,
    });
  } catch (error) {
    console.error("[test-kb-manage] GET error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const hint = /relation .*test_knowledge_bases.* does not exist/i.test(msg)
      ? "Table test_knowledge_bases is missing. Run migrations (redeploy triggers scripts/run-migration.mjs)."
      : undefined;
    return NextResponse.json(
      { success: false, error: msg, hint },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/test-kb-manage
 * Create a new KB test
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { canonical_name, synonyms = [], variants = [], category, description } = body;

    if (!canonical_name || typeof canonical_name !== "string") {
      return NextResponse.json(
        { success: false, error: "canonical_name is required" },
        { status: 400 }
      );
    }

    // Check if already exists
    const existing = await prisma.testKnowledgeBase.findUnique({
      where: { canonical_name },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Test already exists in KB" },
        { status: 409 }
      );
    }

    const test = await prisma.testKnowledgeBase.create({
      data: {
        canonical_name: canonical_name.trim(),
        synonyms: Array.isArray(synonyms) ? synonyms.filter(Boolean) : [],
        variants: Array.isArray(variants) ? variants.filter(Boolean) : [],
        category: category?.trim() || null,
        description: description?.trim() || null,
      },
    });

    console.log(`[test-kb-manage] Created KB test: ${test.canonical_name}`);

    return NextResponse.json({
      success: true,
      test,
      message: `Created: ${test.canonical_name}`,
    });
  } catch (error) {
    console.error("[test-kb-manage] POST error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
