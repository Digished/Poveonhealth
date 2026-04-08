export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

async function getDefaultCommission(): Promise<number> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "default_commission_pct" } });
  return setting ? parseFloat(setting.value) : 15;
}

async function generateSynonyms(testName: string, categoryLabel?: string): Promise<string[]> {
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
          content: `Generate 7-10 common synonyms, abbreviations, and alternate names for this medical lab test: "${testName}"${categoryLabel ? ` (category: ${categoryLabel})` : ""}. Nigerian medical context. Include the original name.`,
        },
      ],
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { synonyms?: string[] };
    return Array.from(new Set([testName, ...(parsed.synonyms ?? [])]));
  } catch {
    return [testName];
  }
}

/** GET /api/admin/labs/[id]/catalog — list all offered tests for a lab */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const tests = await prisma.labOfferedTest.findMany({
    where: { lab_id: id },
    orderBy: { created_at: "asc" },
  });

  const active = tests.filter((t) => t.is_active);
  const mapped = active.length;
  const unresolved = 0;

  return NextResponse.json({
    success: true,
    tests: tests.map((t) => ({
      ...t,
      lab_price: Number(t.lab_price),
      poveon_fee: t.poveon_fee ? Number(t.poveon_fee) : null,
      commission_pct: t.commission_pct ? Number(t.commission_pct) : null,
      synonyms: Array.isArray(t.synonyms) ? t.synonyms : [],
    })),
    summary: { total: tests.length, mapped, unresolved },
  });
}

const CreateSchema = z.object({
  raw_name: z.string().min(1).max(300),
  category_label: z.string().max(200).optional(),
  lab_price: z.number().positive(),
  commission_pct: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
  synonyms: z.array(z.string()).optional(), // Can be provided but AI generation takes precedence for new tests
});

/** POST /api/admin/labs/[id]/catalog — add a single offered test with auto-generated AI synonyms */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });

  const { raw_name, category_label, lab_price, is_active = true } = parsed.data;
  const commission_pct = parsed.data.commission_pct ?? (await getDefaultCommission());
  const poveon_fee = parseFloat(((lab_price * commission_pct) / 100).toFixed(2));

  // Always auto-generate AI synonyms for consistency and quality
  // User can edit them later if needed via the bulk "Manual Synonyms" or "Generate AI" buttons
  const synonyms = await generateSynonyms(raw_name, category_label);

  const test = await prisma.labOfferedTest.upsert({
    where: { lab_id_raw_name: { lab_id: id, raw_name } },
    create: { lab_id: id, raw_name, category_label: category_label ?? null, synonyms, lab_price, poveon_fee, commission_pct, is_active },
    update: { category_label: category_label ?? null, synonyms, lab_price, poveon_fee, commission_pct, is_active },
  });

  return NextResponse.json({
    success: true,
    test: { ...test, lab_price: Number(test.lab_price), poveon_fee: Number(test.poveon_fee), commission_pct: Number(test.commission_pct), synonyms: Array.isArray(test.synonyms) ? test.synonyms : [] },
  });
}
