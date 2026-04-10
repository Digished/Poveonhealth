export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/admin/test-kb-manage/[id]
 * Update a KB test (synonyms, variants, category, description)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json();
    const { synonyms, variants, category, description } = body;

    const test = await prisma.testKnowledgeBase.update({
      where: { id },
      data: {
        ...(synonyms !== undefined && { synonyms: Array.isArray(synonyms) ? synonyms.filter(Boolean) : [] }),
        ...(variants !== undefined && { variants: Array.isArray(variants) ? variants.filter(Boolean) : [] }),
        ...(category !== undefined && { category: category?.trim() || null }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    });

    console.log(`[test-kb-manage] Updated KB test: ${test.canonical_name}`);

    return NextResponse.json({
      success: true,
      test,
    });
  } catch (error) {
    console.error("[test-kb-manage] PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update KB test" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/test-kb-manage/[id]
 * Deactivate a KB test (soft delete)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await params;

    const test = await prisma.testKnowledgeBase.update({
      where: { id },
      data: { is_active: false },
    });

    console.log(`[test-kb-manage] Deactivated KB test: ${test.canonical_name}`);

    return NextResponse.json({
      success: true,
      message: `Removed: ${test.canonical_name}`,
    });
  } catch (error) {
    console.error("[test-kb-manage] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete KB test" },
      { status: 500 }
    );
  }
}
