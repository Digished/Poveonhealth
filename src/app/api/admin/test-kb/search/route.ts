export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const query = req.nextUrl.searchParams.get("q") || "";
    const category = req.nextUrl.searchParams.get("category") || "";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

    const where: any = { is_active: true };

    if (query) {
      where.OR = [
        { canonical_name: { contains: query, mode: "insensitive" } },
        { synonyms: { has: query } },
      ];
    }

    if (category) {
      where.category = category;
    }

    const tests = await prisma.testKnowledgeBase.findMany({
      where,
      select: {
        id: true,
        canonical_name: true,
        synonyms: true,
        variants: true,
        category: true,
      },
      orderBy: { canonical_name: "asc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      tests: tests.map((t) => ({
        id: t.id,
        canonical: t.canonical_name,
        synonyms: Array.isArray(t.synonyms) ? (t.synonyms as string[]) : [],
        variants: Array.isArray(t.variants) ? (t.variants as string[]) : [],
        category: t.category,
      })),
      count: tests.length,
    });
  } catch (error) {
    console.error("[admin-kb-search] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to search tests" },
      { status: 500 }
    );
  }
}
