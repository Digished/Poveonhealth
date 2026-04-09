export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { createOperation, updateOperation, deleteOperation } from "@/lib/operation-progress";
import { randomUUID } from "crypto";

// Create OpenAI instance once at module level for reuse
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function generateSynonyms(testName: string, categoryLabel?: string | null): Promise<string[]> {
  if (!openai) return [testName];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: 'Return JSON: { "synonyms": string[] }' },
          {
            role: "user",
            content: `Generate 5-7 common synonyms, abbreviations, and alternate names for this medical lab test: "${testName}"${categoryLabel ? ` (category: ${categoryLabel})` : ""}. Include the original name. Return as array.`,
          },
        ],
      } as any, { signal: controller.signal });

      clearTimeout(timeoutId);
      const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { synonyms?: string[] };
      return Array.from(new Set([testName, ...(parsed.synonyms ?? [])]));
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    console.error(`Synonym generation failed for "${testName}":`, err);
    return [testName];
  }
}

/** Merge synonyms into a KbTest row if it exists (no transaction, fast) */
async function syncSynonymsToKb(rawName: string, newSyns: string[]) {
  const existingKb = await prisma.kbTest.findFirst({
    where: { canonical_name: { equals: rawName, mode: "insensitive" } },
    select: { id: true, synonyms: true },
  });
  if (!existingKb) return;
  const current = Array.isArray(existingKb.synonyms) ? (existingKb.synonyms as string[]) : [];
  const merged = Array.from(new Set([...current, ...newSyns]));
  if (merged.length !== current.length) {
    await prisma.kbTest.update({ where: { id: existingKb.id }, data: { synonyms: merged } });
  }
}

const BulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), ids: z.array(z.string()).min(1) }),
  z.object({
    action: z.literal("set_commission"),
    ids: z.array(z.string()).min(1),
    commission_pct: z.number().min(0).max(100),
  }),
  z.object({
    action: z.literal("set_synonyms"),
    ids: z.array(z.string()).min(1),
    synonyms: z.array(z.string()),
  }),
  z.object({ action: z.literal("generate_synonyms"), ids: z.array(z.string()).min(1) }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
  }

  // ── delete ────────────────────────────────────────────────────────────────
  if (parsed.data.action === "delete") {
    const { count } = await prisma.labOfferedTest.deleteMany({
      where: { id: { in: parsed.data.ids }, lab_id: id },
    });
    return NextResponse.json({ success: true, deleted: count });
  }

  // ── set_commission ────────────────────────────────────────────────────────
  if (parsed.data.action === "set_commission") {
    const { ids, commission_pct } = parsed.data;

    const tests = await prisma.labOfferedTest.findMany({
      where: { id: { in: ids }, lab_id: id },
      select: { id: true, lab_price: true },
    });

    // No transaction — each row updated independently so no timeout risk
    let updated = 0;
    for (const t of tests) {
      await prisma.labOfferedTest.update({
        where: { id: t.id },
        data: {
          commission_pct,
          poveon_fee: parseFloat(((Number(t.lab_price) * commission_pct) / 100).toFixed(2)),
        },
      });
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  }

  // ── set_synonyms ──────────────────────────────────────────────────────────
  if (parsed.data.action === "set_synonyms") {
    const { ids, synonyms } = parsed.data;

    const tests = await prisma.labOfferedTest.findMany({
      where: { id: { in: ids }, lab_id: id },
      select: { id: true, raw_name: true },
    });

    let updated = 0;
    for (const t of tests) {
      await prisma.labOfferedTest.update({
        where: { id: t.id },
        data: { synonyms },
      });
      await syncSynonymsToKb(t.raw_name, synonyms);
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  }

  // ── generate_synonyms ─────────────────────────────────────────────────────
  if (parsed.data.action === "generate_synonyms") {
    const { ids } = parsed.data;

    const tests = await prisma.labOfferedTest.findMany({
      where: { id: { in: ids }, lab_id: id },
      select: { id: true, raw_name: true, category_label: true },
    });

    if (tests.length === 0) return NextResponse.json({ success: true, updated: 0, operationId: null });

    // Create a unique operation ID and start tracking progress
    const operationId = randomUUID();
    const progressKey = `${id}-${operationId}`;
    createOperation(progressKey, tests.length);

    // Return immediately with operationId so client can poll progress
    // The actual generation happens in the background
    (async () => {
      try {
        let completed = 0;
        for (const t of tests) {
          const syns = await generateSynonyms(t.raw_name, t.category_label);
          await prisma.labOfferedTest.update({
            where: { id: t.id },
            data: { synonyms: syns },
          });
          await syncSynonymsToKb(t.raw_name, syns);

          // Update progress
          completed++;
          updateOperation(progressKey, completed);
        }

        // Clean up after 30 seconds so client can fetch final status
        setTimeout(() => deleteOperation(progressKey), 30000);
      } catch (error) {
        console.error("Error in background synonym generation:", error);
        // Still clean up on error
        setTimeout(() => deleteOperation(progressKey), 30000);
      }
    })();

    return NextResponse.json({
      success: true,
      operationId,
      message: "Generating synonyms in background. Use operationId to check progress.",
    });
  }
}
