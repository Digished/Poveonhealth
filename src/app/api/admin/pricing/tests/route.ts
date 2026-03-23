export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

async function verifyAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/pricing/tests?category_id=xxx
 * Returns all tests in the category with their synonyms and base price.
 */
export async function GET(request: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get("category_id");

  const tests = await prisma.catalogTest.findMany({
    where: categoryId ? { category_id: categoryId } : {},
    orderBy: { canonical_name: "asc" },
    include: { synonyms: { orderBy: { synonym: "asc" } } },
  });

  return NextResponse.json({ success: true, tests });
}

/**
 * POST /api/admin/pricing/tests
 * Create a new test + optional synonyms.
 * If action === "ai_suggest", returns AI-suggested tests for a category.
 */
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as {
    action?: "ai_suggest";
    category_id?: string;
    canonical_name?: string;
    base_price?: number;
    is_rapid_test?: boolean;
    synonyms?: string[];
  };

  // AI suggest mode
  if (body.action === "ai_suggest") {
    if (!body.category_id) return NextResponse.json({ error: "category_id required" }, { status: 400 });

    const category = await prisma.testCategory.findUnique({ where: { id: body.category_id } });
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return only a JSON array, no prose." },
        {
          role: "user",
          content: `Suggest 10 common lab tests for the category "${category.name}" used in Nigeria.
Return: [{ "name": string, "is_rapid_test": boolean, "synonyms": string[] }]`,
        },
      ],
    });

    const raw = response.choices[0].message.content?.trim() ?? "[]";
    const json = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
    const suggestions = JSON.parse(json);
    return NextResponse.json({ success: true, suggestions });
  }

  // Create mode
  const { category_id, canonical_name, base_price, is_rapid_test, synonyms } = body;

  if (!category_id || !canonical_name?.trim()) {
    return NextResponse.json({ error: "category_id and canonical_name are required" }, { status: 400 });
  }

  try {
    const test = await prisma.catalogTest.create({
      data: {
        category_id,
        canonical_name: canonical_name.trim(),
        base_price: base_price ?? 0,
        is_rapid_test: is_rapid_test ?? false,
        synonyms: synonyms?.length
          ? {
              createMany: {
                data: [
                  { synonym: canonical_name.trim() },
                  ...synonyms.filter((s) => s.trim()).map((s) => ({ synonym: s.trim() })),
                ],
                skipDuplicates: true,
              },
            }
          : {
              create: { synonym: canonical_name.trim() },
            },
      },
      include: { synonyms: true },
    });

    return NextResponse.json({ success: true, test }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Test name already exists in this category" }, { status: 409 });
  }
}

/**
 * PATCH /api/admin/pricing/tests
 * Update base_price, is_rapid_test, is_active, or synonyms.
 */
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as {
    id?: string;
    base_price?: number;
    is_rapid_test?: boolean;
    is_active?: boolean;
    add_synonyms?: string[];
    remove_synonym_ids?: string[];
    // bulk action
    action?: "bulk_price";
    category_id?: string;
  };
  const { id, base_price, is_rapid_test, is_active, add_synonyms, remove_synonym_ids } = body;

  // Bulk price update: set base_price for every active test in a category
  if (body.action === "bulk_price") {
    if (!body.category_id || body.base_price === undefined) {
      return NextResponse.json({ error: "category_id and base_price required" }, { status: 400 });
    }
    const { count } = await prisma.catalogTest.updateMany({
      where: { category_id: body.category_id },
      data: { base_price: body.base_price },
    });
    return NextResponse.json({ success: true, updated: count });
  }

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    await tx.catalogTest.update({
      where: { id },
      data: {
        ...(base_price !== undefined ? { base_price } : {}),
        ...(is_rapid_test !== undefined ? { is_rapid_test } : {}),
        ...(is_active !== undefined ? { is_active } : {}),
      },
    });

    if (add_synonyms?.length) {
      await tx.testSynonym.createMany({
        data: add_synonyms.filter((s) => s.trim()).map((s) => ({ catalog_test_id: id, synonym: s.trim() })),
        skipDuplicates: true,
      });
    }

    if (remove_synonym_ids?.length) {
      await tx.testSynonym.deleteMany({ where: { id: { in: remove_synonym_ids } } });
    }
  });

  const updated = await prisma.catalogTest.findUnique({
    where: { id },
    include: { synonyms: { orderBy: { synonym: "asc" } } },
  });

  return NextResponse.json({ success: true, test: updated });
}

/** DELETE /api/admin/pricing/tests?id=xxx */
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.catalogTest.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
