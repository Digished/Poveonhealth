export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const MapTestSchema = z.object({
  labTestName: z.string().min(1).max(200),
  knowledgeBaseId: z.string().uuid(),
  variantsAvailable: z.array(z.string()).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    // Verify lab exists
    const lab = await prisma.lab.findUnique({ where: { id } });
    if (!lab) {
      return NextResponse.json({ error: "Lab not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = MapTestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // Verify KB test exists
    const kbTest = await prisma.testKnowledgeBase.findUnique({
      where: { id: parsed.data.knowledgeBaseId },
    });

    if (!kbTest) {
      return NextResponse.json(
        { success: false, error: "Knowledge base test not found" },
        { status: 404 }
      );
    }

    // Check if mapping already exists
    const existing = await prisma.labTestKnowledgeBaseMapping.findUnique({
      where: { lab_id_lab_test_name: { lab_id: id, lab_test_name: parsed.data.labTestName } },
    });

    if (existing) {
      // Update existing mapping
      const updated = await prisma.labTestKnowledgeBaseMapping.update({
        where: { id: existing.id },
        data: {
          knowledge_base_id: parsed.data.knowledgeBaseId,
          variants_available: parsed.data.variantsAvailable,
        },
      });

      return NextResponse.json({
        success: true,
        mapping: updated,
        message: "Mapping updated",
      });
    }

    // Create new mapping
    const mapping = await prisma.labTestKnowledgeBaseMapping.create({
      data: {
        lab_id: id,
        lab_test_name: parsed.data.labTestName,
        knowledge_base_id: parsed.data.knowledgeBaseId,
        variants_available: parsed.data.variantsAvailable,
      },
    });

    console.log(`[admin-mapping] Mapped ${parsed.data.labTestName} to ${kbTest.canonical_name}`);

    return NextResponse.json({
      success: true,
      mapping,
      message: `Mapped: ${parsed.data.labTestName} → ${kbTest.canonical_name}`,
    });
  } catch (error) {
    console.error("[admin-mapping] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create mapping" },
      { status: 500 }
    );
  }
}

// GET: List mappings for a lab
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  try {
    const mappings = await prisma.labTestKnowledgeBaseMapping.findMany({
      where: { lab_id: id, is_active: true },
      include: {
        knowledge_base: {
          select: { canonical_name: true, synonyms: true, variants: true },
        },
      },
      orderBy: { lab_test_name: "asc" },
    });

    return NextResponse.json({
      success: true,
      mappings: mappings.map((m) => ({
        id: m.id,
        labTestName: m.lab_test_name,
        canonical: m.knowledge_base.canonical_name,
        synonyms: Array.isArray(m.knowledge_base.synonyms)
          ? (m.knowledge_base.synonyms as string[])
          : [],
        variantsAvailable: m.variants_available,
      })),
      count: mappings.length,
    });
  } catch (error) {
    console.error("[admin-mapping-list] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch mappings" },
      { status: 500 }
    );
  }
}
