export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const PatchSchema = z.object({
  raw_name: z.string().min(1).max(300).optional(),
  lab_price: z.number().positive().optional(),
  is_active: z.boolean().optional(),
  category_label: z.string().max(200).nullable().optional(),
  synonyms: z.array(z.string()).optional(),
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

  // Check for name collision outside transaction first
  if (parsed.data.raw_name !== undefined && parsed.data.raw_name !== existing.raw_name) {
    const conflict = await prisma.labOfferedTest.findUnique({
      where: { lab_id_raw_name: { lab_id: id, raw_name: parsed.data.raw_name } },
    });
    if (conflict) return NextResponse.json({ error: "A test with that name already exists" }, { status: 409 });
  }

  const test = await prisma.$transaction(async (tx) => {
    const updates: Record<string, unknown> = {};

    if (parsed.data.raw_name !== undefined && parsed.data.raw_name !== existing.raw_name) {
      updates.raw_name = parsed.data.raw_name;
    }

    if (parsed.data.lab_price !== undefined) updates.lab_price = parsed.data.lab_price;
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
    if (parsed.data.category_label !== undefined) updates.category_label = parsed.data.category_label;
    if (parsed.data.synonyms !== undefined) updates.synonyms = parsed.data.synonyms;

    const updated = await tx.labOfferedTest.update({ where: { id: testId }, data: updates });

    // Sync synonyms to knowledge base if they were updated
    if (parsed.data.synonyms !== undefined) {
      const existingKb = await tx.kbTest.findFirst({
        where: {
          canonical_name: {
            equals: updated.raw_name,
            mode: "insensitive",
          },
        },
      });

      if (existingKb) {
        // Merge new synonyms with existing KB synonyms
        const currentSyns = Array.isArray(existingKb.synonyms)
          ? (existingKb.synonyms as string[])
          : [];
        const newSyns = Array.isArray(parsed.data.synonyms) ? parsed.data.synonyms : [];
        const mergedSyns = Array.from(new Set([...currentSyns, ...newSyns]));

        await tx.kbTest.update({
          where: { id: existingKb.id },
          data: { synonyms: mergedSyns },
        });
      }
    }

    return updated;
  });

  return NextResponse.json({
    success: true,
    test: {
      ...test,
      lab_price: Number(test.lab_price),
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
