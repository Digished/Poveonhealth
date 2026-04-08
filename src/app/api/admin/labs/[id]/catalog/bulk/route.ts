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

    if (tests.length === 0) return NextResponse.json({ success: true, updated: 0 });

    // Generate all synonyms first (outside any transaction), then write row by row
    let updated = 0;
    for (const t of tests) {
      const syns = await generateSynonyms(t.raw_name, t.category_label);
      await prisma.labOfferedTest.update({
        where: { id: t.id },
        data: { synonyms: syns },
      });
      await syncSynonymsToKb(t.raw_name, syns);
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  }
}
