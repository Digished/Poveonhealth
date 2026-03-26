export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const PatchSchema = z.object({
  raw_name: z.string().min(1).max(300).optional(),
  lab_price: z.number().positive().optional(),
  commission_pct: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
  category_label: z.string().max(200).nullable().optional(),
  synonyms: z.array(z.string()).optional(),
  catalog_test_id: z.string().nullable().optional(),
});

/** PATCH /api/admin/labs/[id]/catalog/[testId] — update price, commission, name, or active state */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, testId } = await params;
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await prisma.labOfferedTest.findFirst({ where: { id: testId, lab_id: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};

  if (parsed.data.raw_name !== undefined && parsed.data.raw_name !== existing.raw_name) {
    // Check for name collision
    const conflict = await prisma.labOfferedTest.findUnique({
      where: { lab_id_raw_name: { lab_id: id, raw_name: parsed.data.raw_name } },
    });
    if (conflict) return NextResponse.json({ error: "A test with that name already exists" }, { status: 409 });
    updates.raw_name = parsed.data.raw_name;
  }

  if (parsed.data.lab_price !== undefined) {
    updates.lab_price = parsed.data.lab_price;
    const commission = parsed.data.commission_pct ?? Number(existing.commission_pct ?? 15);
    updates.poveon_fee = parseFloat(((parsed.data.lab_price * commission) / 100).toFixed(2));
  }

  if (parsed.data.commission_pct !== undefined) {
    updates.commission_pct = parsed.data.commission_pct;
    const price = parsed.data.lab_price ?? Number(existing.lab_price);
    updates.poveon_fee = parseFloat(((price * parsed.data.commission_pct) / 100).toFixed(2));
  }

  if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
  if (parsed.data.category_label !== undefined) updates.category_label = parsed.data.category_label;
  if (parsed.data.synonyms !== undefined) updates.synonyms = parsed.data.synonyms;

  if (parsed.data.catalog_test_id !== undefined) {
    updates.catalog_test_id = parsed.data.catalog_test_id;
    if (parsed.data.catalog_test_id) {
      updates.mapped_by = admin.email ?? "admin";
      updates.mapped_at = new Date();
    }
  }

  const test = await prisma.labOfferedTest.update({ where: { id: testId }, data: updates });

  return NextResponse.json({
    success: true,
    test: {
      ...test,
      lab_price: Number(test.lab_price),
      poveon_fee: test.poveon_fee ? Number(test.poveon_fee) : null,
      commission_pct: test.commission_pct ? Number(test.commission_pct) : null,
      synonyms: Array.isArray(test.synonyms) ? test.synonyms : [],
    },
  });
}

/** DELETE /api/admin/labs/[id]/catalog/[testId] — remove a test from lab catalog */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; testId: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, testId } = await params;

  const existing = await prisma.labOfferedTest.findFirst({ where: { id: testId, lab_id: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.labOfferedTest.delete({ where: { id: testId } });

  return NextResponse.json({ success: true });
}
