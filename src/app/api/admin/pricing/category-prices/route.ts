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
 * GET /api/admin/pricing/category-prices?lab_id=xxx
 *
 * Returns all categories with their global base_price and the lab's override (if any).
 * Used to set a fallback price for unlisted tests that are matched to a category.
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const labId = searchParams.get("lab_id");

  const categories = await prisma.testCategory.findMany({
    orderBy: { sort_order: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      base_price: true,
      _count: { select: { tests: true } },
    },
  });

  let overrideMap = new Map<string, number>();
  if (labId) {
    const overrides = await prisma.labCategoryPrice.findMany({
      where: { lab_id: labId },
      select: { category_id: true, price: true },
    });
    overrideMap = new Map(overrides.map((o) => [o.category_id, Number(o.price)]));
  }

  const rows = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    test_count: cat._count.tests,
    base_price: Number(cat.base_price),
    override_price: overrideMap.has(cat.id) ? overrideMap.get(cat.id)! : null,
    effective_price: overrideMap.has(cat.id) ? overrideMap.get(cat.id)! : Number(cat.base_price),
  }));

  return NextResponse.json({ success: true, rows });
}

/**
 * PATCH /api/admin/pricing/category-prices
 * Update the global base_price for a category.
 * Body: { category_id, base_price }
 */
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { category_id, base_price } = await request.json() as {
    category_id?: string; base_price?: number;
  };

  if (!category_id || base_price === undefined) {
    return NextResponse.json({ error: "category_id and base_price are required" }, { status: 400 });
  }

  const category = await prisma.testCategory.update({
    where: { id: category_id },
    data: { base_price },
  });

  return NextResponse.json({ success: true, category });
}

/**
 * PUT /api/admin/pricing/category-prices
 * Set (upsert) a lab-specific category price override.
 * Body: { lab_id, category_id, price }
 */
export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { lab_id, category_id, price } = await request.json() as {
    lab_id?: string; category_id?: string; price?: number;
  };

  if (!lab_id || !category_id || price === undefined) {
    return NextResponse.json({ error: "lab_id, category_id, and price are required" }, { status: 400 });
  }

  const override = await prisma.labCategoryPrice.upsert({
    where: { lab_id_category_id: { lab_id, category_id } },
    create: { lab_id, category_id, price, updated_by: admin.email ?? undefined },
    update: { price, updated_by: admin.email ?? undefined },
  });

  return NextResponse.json({ success: true, override });
}

/**
 * DELETE /api/admin/pricing/category-prices
 * Clear a lab-specific category override (reverts to global base_price).
 * Body: { lab_id, category_id } or { lab_id } to clear all for that lab.
 */
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { lab_id, category_id } = await request.json() as {
    lab_id?: string; category_id?: string;
  };

  if (!lab_id) return NextResponse.json({ error: "lab_id is required" }, { status: 400 });

  if (category_id) {
    await prisma.labCategoryPrice.deleteMany({ where: { lab_id, category_id } });
  } else {
    await prisma.labCategoryPrice.deleteMany({ where: { lab_id } });
  }

  return NextResponse.json({ success: true });
}
