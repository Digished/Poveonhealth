export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/test-kb-manage/migrate
 * Migrate old KbTest data to new TestKnowledgeBase
 * This endpoint:
 * 1. Migrates canonical_name and synonyms from KbTest to TestKnowledgeBase
 * 2. Clears old AI-generated synonyms from lab offered tests
 * 3. Creates mappings between labs and KB tests based on synonyms
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { action } = await req.json();

    if (action === "migrate_from_old_kb") {
      // Step 1: Migrate old KbTest to TestKnowledgeBase
      const oldKbTests = await prisma.kbTest.findMany();
      let migrated = 0;
      let skipped = 0;

      for (const oldTest of oldKbTests) {
        const existing = await prisma.testKnowledgeBase.findUnique({
          where: { canonical_name: oldTest.canonical_name },
        });

        if (existing) {
          skipped++;
          continue;
        }

        await prisma.testKnowledgeBase.create({
          data: {
            canonical_name: oldTest.canonical_name,
            synonyms: oldTest.synonyms || [],
            variants: [],
            category: oldTest.category || null,
            description: oldTest.description || null,
            is_active: true,
          },
        });

        migrated++;
      }

      return NextResponse.json({
        success: true,
        message: `Migrated ${migrated} tests from old KB, ${skipped} already existed`,
        migrated,
        skipped,
      });
    } else if (action === "clear_old_synonyms") {
      // Step 2: Clear AI-generated synonyms from old lab offered tests
      const result = await prisma.labOfferedTest.updateMany({
        data: {
          synonyms: [], // Clear all AI-generated synonyms
        },
      });

      return NextResponse.json({
        success: true,
        message: `Cleared synonyms from ${result.count} lab offered tests`,
        cleared: result.count,
      });
    } else if (action === "map_labs_to_kb") {
      // Step 3: Create mappings between labs and KB tests based on name matching
      let created = 0;
      let total = 0;

      // Get all lab offered tests
      const labTests = await prisma.labOfferedTest.findMany({
        where: { is_active: true },
        include: { lab: true },
      });

      // Get all KB tests with synonyms
      const kbTests = await prisma.testKnowledgeBase.findMany({
        where: { is_active: true },
      });

      // For each lab test, try to match to a KB test
      for (const labTest of labTests) {
        total++;
        const labTestName = labTest.raw_name.toLowerCase().trim();

        // Try to find a matching KB test
        let matchedKb = null;

        // First, try exact match on canonical name
        matchedKb = kbTests.find(
          (kb) => kb.canonical_name.toLowerCase().trim() === labTestName
        );

        // If no exact match, try matching against synonyms
        if (!matchedKb) {
          for (const kb of kbTests) {
            const syns = (Array.isArray(kb.synonyms) ? kb.synonyms : []) as string[];
            if (syns.some((s) => s.toLowerCase().trim() === labTestName)) {
              matchedKb = kb;
              break;
            }
          }
        }

        // If still no match, try substring matching
        if (!matchedKb) {
          for (const kb of kbTests) {
            if (
              kb.canonical_name.toLowerCase().includes(labTestName) ||
              labTestName.includes(kb.canonical_name.toLowerCase())
            ) {
              matchedKb = kb;
              break;
            }
          }
        }

        if (matchedKb) {
          // Check if mapping already exists
          const existingMapping = await prisma.labTestKnowledgeBaseMapping.findUnique({
            where: {
              lab_id_lab_test_name: {
                lab_id: labTest.lab_id,
                lab_test_name: labTest.raw_name,
              },
            },
          });

          if (!existingMapping) {
            await prisma.labTestKnowledgeBaseMapping.create({
              data: {
                lab_id: labTest.lab_id,
                lab_test_name: labTest.raw_name,
                knowledge_base_id: matchedKb.id,
                is_active: true,
              },
            });
            created++;
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Created mappings for ${created} out of ${total} lab tests`,
        created,
        total,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[test-kb-migrate] error:", error);
    return NextResponse.json(
      { success: false, error: "Migration failed" },
      { status: 500 }
    );
  }
}
