export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/pricing/unmapped?status=pending
 * List unmapped tests for admin review.
 */
export async function GET(request: NextRequest) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "pending";

  const items = await prisma.unmappedTest.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { occurrence_count: "desc" },
    take: 200,
  });

  const pendingCount = await prisma.unmappedTest.count({ where: { status: "pending" } });

  return NextResponse.json({ success: true, items, pending_count: pendingCount });
}

/**
 * PATCH /api/admin/pricing/unmapped
 * Resolve or ignore an unmapped test.
 *
 * To map to existing test:  { id, action: "map", catalog_test_id }
 * To create a new test:     { id, action: "create", category_id, canonical_name, synonyms? }
 * To ignore:                { id, action: "ignore" }
 */
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json() as {
    id?: string;
    action?: "map" | "create" | "ignore";
    catalog_test_id?: string;
    category_id?: string;
    canonical_name?: string;
    synonyms?: string[];
  };

  const { id, action } = body;
  if (!id || !action) return NextResponse.json({ error: "id and action are required" }, { status: 400 });

  const unmapped = await prisma.unmappedTest.findUnique({ where: { id } });
  if (!unmapped) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "ignore") {
    await prisma.unmappedTest.update({ where: { id }, data: { status: "ignored" } });
    return NextResponse.json({ success: true });
  }

  if (action === "map") {
    if (!body.catalog_test_id) return NextResponse.json({ error: "catalog_test_id required" }, { status: 400 });

    // Add the raw name as a synonym on the target test
    await prisma.$transaction([
      prisma.testSynonym.upsert({
        where: { catalog_test_id_synonym: { catalog_test_id: body.catalog_test_id, synonym: unmapped.raw_name } },
        create: { catalog_test_id: body.catalog_test_id, synonym: unmapped.raw_name },
        update: {},
      }),
      prisma.unmappedTest.update({
        where: { id },
        data: { status: "resolved", resolved_to: body.catalog_test_id },
      }),
    ]);

    return NextResponse.json({ success: true });
  }

  if (action === "create") {
    if (!body.category_id || !body.canonical_name?.trim()) {
      return NextResponse.json({ error: "category_id and canonical_name required" }, { status: 400 });
    }

    const synonyms = [
      body.canonical_name.trim(),
      unmapped.raw_name,
      ...(body.synonyms ?? []),
    ].filter((s, i, a) => s.trim() && a.indexOf(s) === i);

    const newTest = await prisma.catalogTest.create({
      data: {
        category_id: body.category_id,
        canonical_name: body.canonical_name.trim(),
        base_price: 0,
        synonyms: {
          createMany: {
            data: synonyms.map((s) => ({ synonym: s })),
            skipDuplicates: true,
          },
        },
      },
    });

    await prisma.unmappedTest.update({
      where: { id },
      data: { status: "resolved", resolved_to: newTest.id },
    });

    return NextResponse.json({ success: true, test: newTest });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
