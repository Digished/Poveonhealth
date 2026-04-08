export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const BulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("set_commission"), ids: z.array(z.string()).min(1), commission_pct: z.number().min(0).max(100) }),
  z.object({ action: z.literal("set_synonyms"), ids: z.array(z.string()).min(1), synonyms: z.array(z.string()) }),
]);

/**
 * POST /api/admin/labs/[id]/catalog/bulk
 * Body: { action: "delete", ids: string[] }
 *       { action: "set_commission", ids: string[], commission_pct: number }
 *       { action: "set_synonyms", ids: string[], synonyms: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });

  if (parsed.data.action === "delete") {
    const { count } = await prisma.labOfferedTest.deleteMany({
      where: { id: { in: parsed.data.ids }, lab_id: id },
    });
    return NextResponse.json({ success: true, deleted: count });
  }

  if (parsed.data.action === "set_commission") {
    const { ids, commission_pct } = parsed.data;
    // Update each test's commission_pct and recalculate poveon_fee within a single transaction
    const updates = await prisma.$transaction(async (tx) => {
      const tests = await tx.labOfferedTest.findMany({
        where: { id: { in: ids }, lab_id: id },
        select: { id: true, lab_price: true },
      });

      const updatePromises = tests.map((t) =>
        tx.labOfferedTest.update({
          where: { id: t.id },
          data: {
            commission_pct,
            poveon_fee: parseFloat(((Number(t.lab_price) * commission_pct) / 100).toFixed(2)),
          },
        })
      );

      return Promise.all(updatePromises);
    });

    return NextResponse.json({ success: true, updated: updates.length });
  }

  if (parsed.data.action === "set_synonyms") {
    const { ids, synonyms } = parsed.data;
    // Update test synonyms and sync to knowledge base
    const updates = await prisma.$transaction(async (tx) => {
      const tests = await tx.labOfferedTest.findMany({
        where: { id: { in: ids }, lab_id: id },
        select: { id: true, raw_name: true },
      });

      const updatePromises = tests.map((t) =>
        tx.labOfferedTest.update({
          where: { id: t.id },
          data: { synonyms: Array.isArray(synonyms) ? synonyms : [] },
        })
      );

      const updated = await Promise.all(updatePromises);

      // Sync to knowledge base: ensure synonyms are merged into KbTest
      for (const test of updated) {
        const kbName = test.raw_name.toLowerCase().trim();
        const existingKb = await tx.kbTest.findFirst({
          where: {
            canonical_name: {
              equals: test.raw_name,
              mode: "insensitive",
            },
          },
        });

        if (existingKb) {
          // Merge new synonyms with existing ones
          const currentSyns = Array.isArray(existingKb.synonyms)
            ? (existingKb.synonyms as string[])
            : [];
          const newSyns = Array.isArray(test.synonyms)
            ? (test.synonyms as string[])
            : [];
          const mergedSyns = Array.from(new Set([...currentSyns, ...newSyns]));

          await tx.kbTest.update({
            where: { id: existingKb.id },
            data: { synonyms: mergedSyns },
          });
        }
      }

      return updated;
    });

    return NextResponse.json({ success: true, updated: updates.length });
  }
}
