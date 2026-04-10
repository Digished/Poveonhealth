export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Fuzzy string matching with typo tolerance
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }
  return matrix[len2][len1];
}

// Check if input matches a synonym (case-insensitive, fuzzy)
function matchesSynonym(input: string, synonym: string): boolean {
  const inputLower = input.toLowerCase().trim();
  const synLower = synonym.toLowerCase().trim();

  // Exact match
  if (inputLower === synLower) return true;

  // Substring match (e.g., "FBC" in "Full Blood Count (FBC)")
  if (synLower.includes(inputLower) || inputLower.includes(synLower)) return true;

  // Fuzzy match with typo tolerance (e.g., "Brest" → "Breast")
  const distance = levenshteinDistance(inputLower, synLower);
  const tolerance = Math.ceil(synLower.length * 0.2); // 20% tolerance
  return distance <= tolerance;
}

// Try to match input to KB, return matching KB entry and confidence
interface MatchResult {
  kbId: string;
  canonical: string;
  variants: string[];
  confidence: "high" | "medium" | "low";
}

async function matchTestToKB(input: string): Promise<MatchResult | null> {
  const allTests = await prisma.testKnowledgeBase.findMany({
    where: { is_active: true },
    select: { id: true, canonical_name: true, synonyms: true, variants: true },
  });

  let bestMatch: MatchResult | null = null;
  let bestScore = -1;

  for (const test of allTests) {
    const synonyms = Array.isArray(test.synonyms) ? (test.synonyms as string[]) : [];
    const variants = Array.isArray(test.variants) ? (test.variants as string[]) : [];
    const allNames = [test.canonical_name, ...synonyms] as string[];

    for (const name of allNames) {
      if (matchesSynonym(input, name)) {
        // Calculate score based on match type
        const inputLower = input.toLowerCase().trim();
        const nameLower = name.toLowerCase().trim();
        let score = 0;

        // Exact match = highest score
        if (inputLower === nameLower) {
          score = 100;
        }
        // Substring match = medium-high score
        else if (nameLower.includes(inputLower) || inputLower.includes(nameLower)) {
          score = 80;
        }
        // Fuzzy match = medium score
        else {
          const distance = levenshteinDistance(inputLower, nameLower);
          score = Math.max(0, 60 - distance * 5);
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            kbId: test.id,
            canonical: test.canonical_name,
            variants,
            confidence: score >= 95 ? "high" : score >= 70 ? "medium" : "low",
          };
        }
      }
    }
  }

  return bestMatch;
}

const ResolveSchema = z.object({
  labId: z.string().uuid("Lab ID must be a valid UUID"),
  testInputs: z.array(z.string().min(1)).min(1),
});

interface TestResolution {
  input: string;
  matched: boolean;
  status: "resolved" | "ambiguous" | "unknown";
  canonical?: string;
  variants?: string[];
  variantsAvailable?: string[] | null;
  reason?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ResolveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { labId, testInputs } = parsed.data;

    // Verify lab exists
    const lab = await prisma.lab.findUnique({
      where: { id: labId },
      select: { id: true },
    });

    if (!lab) {
      return NextResponse.json(
        { success: false, error: "Lab not found" },
        { status: 404 }
      );
    }

    const results: TestResolution[] = [];

    for (const input of testInputs) {
      // Try to match to KB
      const kbMatch = await matchTestToKB(input);

      if (!kbMatch) {
        // Unknown test
        results.push({
          input,
          matched: false,
          status: "unknown",
          reason: "unknown_test",
        });
        continue;
      }

      // Check if lab has this test
      const labMapping = await prisma.labTestKnowledgeBaseMapping.findFirst({
        where: {
          lab_id: labId,
          knowledge_base_id: kbMatch.kbId,
          is_active: true,
        },
        select: { variants_available: true },
      });

      if (!labMapping) {
        // Test not in this lab's catalog
        results.push({
          input,
          matched: false,
          status: "unknown",
          reason: "not_in_lab",
        });
        continue;
      }

      // Test found in lab
      const variantsAvailable = labMapping.variants_available
        ? (labMapping.variants_available as string[])
        : kbMatch.variants;

      if (variantsAvailable.length > 0) {
        // Has variants - ambiguous until selected
        results.push({
          input,
          matched: true,
          status: "ambiguous",
          canonical: kbMatch.canonical,
          variants: variantsAvailable,
          variantsAvailable,
        });
      } else {
        // Simple test - resolved
        results.push({
          input,
          matched: true,
          status: "resolved",
          canonical: kbMatch.canonical,
          variants: null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("[tests/resolve] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to resolve tests",
      },
      { status: 500 }
    );
  }
}
