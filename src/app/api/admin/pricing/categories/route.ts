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

/** GET /api/admin/pricing/categories — list all categories with test counts */
export async function GET() {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const categories = await prisma.testCategory.findMany({
    orderBy: { sort_order: "asc" },
    include: { _count: { select: { tests: true } } },
  });

  // Count tests with base_price > 0 per category
  const pricedCounts = await prisma.catalogTest.groupBy({
    by: ["category_id"],
    where: { base_price: { gt: 0 } },
    _count: { id: true },
  });
  const pricedMap = Object.fromEntries(pricedCounts.map((r) => [r.category_id, r._count.id]));

  const result = categories.map((cat) => ({
    ...cat,
    priced_count: pricedMap[cat.id] ?? 0,
  }));

  return NextResponse.json({ success: true, categories: result });
}

/** POST /api/admin/pricing/categories — create a new category */
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, description, sort_order } = await request.json() as {
    name?: string; description?: string; sort_order?: number;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  try {
    const category = await prisma.testCategory.create({
      data: { name: name.trim(), slug, description: description?.trim(), sort_order: sort_order ?? 99 },
    });
    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Category name or slug already exists" }, { status: 409 });
  }
}

/** PATCH /api/admin/pricing/categories — update a category */
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, name, description, sort_order } = await request.json() as {
    id?: string; name?: string; description?: string; sort_order?: number;
  };

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const category = await prisma.testCategory.update({
    where: { id },
    data: {
      ...(name ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(sort_order !== undefined ? { sort_order } : {}),
    },
  });

  return NextResponse.json({ success: true, category });
}
