export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import { logLabActivity } from "@/lib/lab-activity";

/**
 * PATCH /api/lab/price-list/[testId]
 * Update a single offered test's price, category, or active status.
 * Writes a PriceChangeLog entry for every changed field.
 *
 * Body: { lab_price?: number; category_label?: string; is_active?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { testId } = await params;

  // Verify this test belongs to the authenticated lab
  const existing = await prisma.labOfferedTest.findFirst({
    where: { id: testId, lab_id: auth.lab_id },
    select: { id: true, raw_name: true, lab_price: true, category_label: true, is_active: true, commission_pct: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { lab_price?: number; category_label?: string; is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const changeLogs: Parameters<typeof prisma.priceChangeLog.create>[0]["data"][] = [];
  const actorEmail = auth.actor_email ?? "api-key";
  const actorRole = auth.auth_method === "member" ? "member" : "owner";

  // ── lab_price ─────────────────────────────────────────────────────────────
  if (body.lab_price !== undefined) {
    const newPrice = Number(body.lab_price);
    if (isNaN(newPrice) || newPrice < 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }
    const oldPrice = Number(existing.lab_price);
    if (newPrice !== oldPrice) {
      // Recalculate poveon_fee if commission_pct is set
      const commPct = existing.commission_pct ? Number(existing.commission_pct) : null;
      updates.lab_price = newPrice;
      if (commPct !== null) {
        updates.poveon_fee = parseFloat(((newPrice * commPct) / 100).toFixed(2));
      }
      changeLogs.push({
        lab_offered_test_id: testId,
        lab_id: auth.lab_id,
        test_name: existing.raw_name,
        changed_by_email: actorEmail,
        changed_by_role: actorRole,
        field_changed: "lab_price",
        old_value: String(oldPrice),
        new_value: String(newPrice),
        old_price: oldPrice,
        new_price: newPrice,
      });
    }
  }

  // ── category_label ────────────────────────────────────────────────────────
  if (body.category_label !== undefined) {
    const newCat = body.category_label.trim();
    const oldCat = existing.category_label ?? "";
    if (newCat !== oldCat) {
      updates.category_label = newCat || null;
      changeLogs.push({
        lab_offered_test_id: testId,
        lab_id: auth.lab_id,
        test_name: existing.raw_name,
        changed_by_email: actorEmail,
        changed_by_role: actorRole,
        field_changed: "category_label",
        old_value: oldCat || null,
        new_value: newCat || null,
      });
    }
  }

  // ── is_active ─────────────────────────────────────────────────────────────
  if (body.is_active !== undefined && body.is_active !== existing.is_active) {
    updates.is_active = body.is_active;
    changeLogs.push({
      lab_offered_test_id: testId,
      lab_id: auth.lab_id,
      test_name: existing.raw_name,
      changed_by_email: actorEmail,
      changed_by_role: actorRole,
      field_changed: "is_active",
      old_value: String(existing.is_active),
      new_value: String(body.is_active),
    });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true, message: "No changes detected" });
  }

  // Persist changes + change-log entries in a single transaction
  const [updated] = await prisma.$transaction([
    prisma.labOfferedTest.update({
      where: { id: testId },
      data: updates,
      select: {
        id: true,
        raw_name: true,
        category_label: true,
        lab_price: true,
        poveon_fee: true,
        commission_pct: true,
        is_active: true,
        updated_at: true,
      },
    }),
    ...changeLogs.map((data) => prisma.priceChangeLog.create({ data })),
  ]);

  // Fire-and-forget activity log
  logLabActivity({
    lab_id: auth.lab_id,
    actor_email: actorEmail,
    actor_role: actorRole,
    action: "price_list_update",
    detail: `Updated ${existing.raw_name}: ${changeLogs.map((c) => `${c.field_changed} → ${c.new_value}`).join("; ")}`,
  });

  return NextResponse.json({
    success: true,
    test: {
      id: updated.id,
      raw_name: updated.raw_name,
      category_label: updated.category_label,
      lab_price: Number(updated.lab_price),
      poveon_fee: updated.poveon_fee ? Number(updated.poveon_fee) : null,
      commission_pct: updated.commission_pct ? Number(updated.commission_pct) : null,
      is_active: updated.is_active,
      updated_at: updated.updated_at.toISOString(),
    },
  });
}

/**
 * GET /api/lab/price-list/[testId]
 * Returns full change history for a single test.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { testId } = await params;

  const [test, history] = await Promise.all([
    prisma.labOfferedTest.findFirst({
      where: { id: testId, lab_id: auth.lab_id },
      select: { id: true, raw_name: true },
    }),
    prisma.priceChangeLog.findMany({
      where: { lab_offered_test_id: testId, lab_id: auth.lab_id },
      orderBy: { changed_at: "desc" },
      take: 100,
    }),
  ]);

  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    success: true,
    test_name: test.raw_name,
    history: history.map((h) => ({
      id: h.id,
      field_changed: h.field_changed,
      old_price: h.old_price ? Number(h.old_price) : null,
      new_price: h.new_price ? Number(h.new_price) : null,
      old_value: h.old_value,
      new_value: h.new_value,
      changed_by: h.changed_by_email,
      changed_by_role: h.changed_by_role,
      changed_at: h.changed_at.toISOString(),
    })),
  });
}
