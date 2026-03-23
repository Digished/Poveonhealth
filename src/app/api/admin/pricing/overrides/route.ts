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
 * GET /api/admin/pricing/overrides?lab_id=xxx
 * Returns all tests with their base price and the lab's override (if any).
 */
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const labId = searchParams.get("lab_id");
  if (!labId) return NextResponse.json({ error: "lab_id is required" }, { status: 400 });

  const [tests, overrides] = await Promise.all([
    prisma.catalogTest.findMany({
      where: { is_active: true },
      orderBy: [{ category: { sort_order: "asc" } }, { canonical_name: "asc" }],
      select: {
        id: true,
        canonical_name: true,
        base_price: true,
        category: { select: { name: true } },
      },
    }),
    prisma.labTestPrice.findMany({
      where: { lab_id: labId },
      select: { catalog_test_id: true, price: true, updated_by: true, updated_at: true },
    }),
  ]);

  const overrideMap = new Map(overrides.map((o) => [o.catalog_test_id, o]));

  const rows = tests.map((t) => {
    const override = overrideMap.get(t.id);
    return {
      id: t.id,
      canonical_name: t.canonical_name,
      category: t.category.name,
      base_price: Number(t.base_price),
      override_price: override ? Number(override.price) : null,
      effective_price: override ? Number(override.price) : Number(t.base_price),
      updated_by: override?.updated_by ?? null,
      updated_at: override?.updated_at ?? null,
    };
  });

  return NextResponse.json({ success: true, rows });
}

/**
 * PUT /api/admin/pricing/overrides
 * Set (upsert) a lab-specific price override.
 * Body: { lab_id, catalog_test_id, price }
 */
export async function PUT(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { lab_id, catalog_test_id, price } = await request.json() as {
    lab_id?: string; catalog_test_id?: string; price?: number;
  };

  if (!lab_id || !catalog_test_id || price === undefined) {
    return NextResponse.json({ error: "lab_id, catalog_test_id, and price are required" }, { status: 400 });
  }

  const override = await prisma.labTestPrice.upsert({
    where: { lab_id_catalog_test_id: { lab_id, catalog_test_id } },
    create: { lab_id, catalog_test_id, price, updated_by: admin.email ?? undefined },
    update: { price, updated_by: admin.email ?? undefined },
  });

  return NextResponse.json({ success: true, override });
}

/**
 * PATCH /api/admin/pricing/overrides
 * Bulk-set override price for all active tests in a category (or all tests).
 * Body: { lab_id, price, category_id? }
 */
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { lab_id, price, category_id } = await request.json() as {
    lab_id?: string; price?: number; category_id?: string;
  };

  if (!lab_id || price === undefined) {
    return NextResponse.json({ error: "lab_id and price are required" }, { status: 400 });
  }

  const tests = await prisma.catalogTest.findMany({
    where: { is_active: true, ...(category_id ? { category_id } : {}) },
    select: { id: true },
  });

  const upserts = tests.map((t) =>
    prisma.labTestPrice.upsert({
      where: { lab_id_catalog_test_id: { lab_id, catalog_test_id: t.id } },
      create: { lab_id, catalog_test_id: t.id, price, updated_by: admin.email ?? undefined },
      update: { price, updated_by: admin.email ?? undefined },
    })
  );

  await Promise.all(upserts);
  return NextResponse.json({ success: true, updated: tests.length });
}

/**
 * DELETE /api/admin/pricing/overrides
 * Clear a lab-specific override (reverts to base price).
 * Body: { lab_id, catalog_test_id } or { lab_id } to clear all for that lab.
 */
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { lab_id, catalog_test_id } = await request.json() as {
    lab_id?: string; catalog_test_id?: string;
  };

  if (!lab_id) return NextResponse.json({ error: "lab_id is required" }, { status: 400 });

  if (catalog_test_id) {
    await prisma.labTestPrice.deleteMany({ where: { lab_id, catalog_test_id } });
  } else {
    // Clear ALL overrides for this lab
    await prisma.labTestPrice.deleteMany({ where: { lab_id } });
  }

  return NextResponse.json({ success: true });
}
