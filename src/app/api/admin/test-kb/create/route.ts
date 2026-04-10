export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const CreateTestSchema = z.object({
  canonical_name: z.string().min(1).max(200),
  synonyms: z.array(z.string()).optional().default([]),
  variants: z.array(z.string()).optional().default([]),
  category: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const parsed = CreateTestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // Check if test already exists
    const existing = await prisma.testKnowledgeBase.findUnique({
      where: { canonical_name: parsed.data.canonical_name },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Test already exists in knowledge base" },
        { status: 409 }
      );
    }

    // Create new KB test
    const newTest = await prisma.testKnowledgeBase.create({
      data: {
        canonical_name: parsed.data.canonical_name,
        synonyms: parsed.data.synonyms,
        variants: parsed.data.variants,
        category: parsed.data.category || null,
        description: parsed.data.description || null,
      },
    });

    console.log(`[admin-kb] Created test: ${newTest.canonical_name}`);

    return NextResponse.json({
      success: true,
      test: newTest,
      message: `Created: ${newTest.canonical_name}`,
    });
  } catch (error) {
    console.error("[admin-kb-create] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create test" },
      { status: 500 }
    );
  }
}
