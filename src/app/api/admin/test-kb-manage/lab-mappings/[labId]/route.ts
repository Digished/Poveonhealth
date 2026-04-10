export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

interface MappedTest {
  labTestId: string;
  labTestName: string;
  canonical: string;
  synonyms: string[];
  variants: string[];
  variantsAvailable: string[] | null;
  isMapped: boolean;
}

/**
 * GET /api/admin/test-kb-manage/lab-mappings/[labId]
 * Get all tests for a lab with their KB mappings
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { labId } = await params;

    // Verify lab exists
    const lab = await prisma.lab.findUnique({ where: { id: labId } });
    if (!lab) {
      return NextResponse.json({ error: "Lab not found" }, { status: 404 });
    }

    // Get all lab offered tests
    const labTests = await prisma.labOfferedTest.findMany({
      where: { lab_id: labId, is_active: true },
      orderBy: { raw_name: "asc" },
    });

    // Get mappings for this lab
    const mappings = await prisma.labTestKnowledgeBaseMapping.findMany({
      where: { lab_id: labId, is_active: true },
      include: {
        knowledge_base: {
          select: { id: true, canonical_name: true, synonyms: true, variants: true },
        },
      },
    });

    // Create mapping lookup
    const mappingByTestName = new Map(
      mappings.map((m) => [m.lab_test_name.toLowerCase().trim(), m])
    );

    // Build result
    const mapped: MappedTest[] = labTests.map((test) => {
      const testNameKey = test.raw_name.toLowerCase().trim();
      const mapping = mappingByTestName.get(testNameKey);

      if (mapping) {
        return {
          labTestId: test.id,
          labTestName: test.raw_name,
          canonical: mapping.knowledge_base.canonical_name,
          synonyms: (Array.isArray(mapping.knowledge_base.synonyms) ? mapping.knowledge_base.synonyms : []) as string[],
          variants: (Array.isArray(mapping.knowledge_base.variants) ? mapping.knowledge_base.variants : []) as string[],
          variantsAvailable: mapping.variants_available
            ? (Array.isArray(mapping.variants_available) ? (mapping.variants_available as string[]) : null)
            : null,
          isMapped: true,
        };
      }

      return {
        labTestId: test.id,
        labTestName: test.raw_name,
        canonical: "",
        synonyms: [],
        variants: [],
        variantsAvailable: null,
        isMapped: false,
      };
    });

    return NextResponse.json({
      success: true,
      lab: { id: lab.id, name: lab.name },
      tests: mapped,
      mappedCount: mapped.filter((t) => t.isMapped).length,
      unmappedCount: mapped.filter((t) => !t.isMapped).length,
      totalCount: mapped.length,
    });
  } catch (error) {
    console.error("[lab-mappings] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch lab mappings" },
      { status: 500 }
    );
  }
}
