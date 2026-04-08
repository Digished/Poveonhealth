export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

async function generateSynonyms(testName: string, categoryLabel?: string | null): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) return [testName];
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: 'Return JSON: { "synonyms": string[] }' },
        {
          role: "user",
          content: `Generate 7-10 common synonyms, abbreviations, and alternate names for this medical lab test: "${testName}"${categoryLabel ? ` (category: ${categoryLabel})` : ""}. Nigerian medical context. Include the original name. Return as array.`,
        },
      ],
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { synonyms?: string[] };
    return Array.from(new Set([testName, ...(parsed.synonyms ?? [])]));
  } catch {
    return [testName];
  }
}

const BulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("set_commission"), ids: z.array(z.string()).min(1), commission_pct: z.number().min(0).max(100) }),
  z.object({ action: z.literal("set_synonyms"), ids: z.array(z.string()).min(1), synonyms: z.array(z.string()) }),
  z.object({ action: z.literal("generate_synonyms"), ids: z.array(z.string()).min(1) }),
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

  if (parsed.data.action === "generate_synonyms") {
    const { ids } = parsed.data;
    // Auto-generate AI synonyms for tests
    const results = await prisma.$transaction(async (tx) => {
      const tests = await tx.labOfferedTest.findMany({
        where: { id: { in: ids }, lab_id: id },
        select: { id: true, raw_name: true, category_label: true },
      });

      let updated = 0;
      const updatePromises = tests.map(async (t) => {
        const syns = await generateSynonyms(t.raw_name, t.category_label);
        await tx.labOfferedTest.update({
          where: { id: t.id },
          data: { synonyms: syns },
        });
        updated++;
      });

      await Promise.all(updatePromises);

      // Sync to knowledge base
      for (const test of tests) {
        const syns = await generateSynonyms(test.raw_name, test.category_label);
        const existingKb = await tx.kbTest.findFirst({
          where: {
            canonical_name: {
              equals: test.raw_name,
              mode: "insensitive",
            },
          },
        });

        if (existingKb) {
          const currentSyns = Array.isArray(existingKb.synonyms)
            ? (existingKb.synonyms as string[])
            : [];
          const mergedSyns = Array.from(new Set([...currentSyns, ...syns]));

          await tx.kbTest.update({
            where: { id: existingKb.id },
            data: { synonyms: mergedSyns },
          });
        }
      }

      return updated;
    });

    return NextResponse.json({ success: true, updated: results });
  }
}
