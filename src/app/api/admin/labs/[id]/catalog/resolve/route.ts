export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
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
          content: `Generate 4–8 common synonyms, abbreviations, and alternate names for this medical lab test: "${testName}"${categoryLabel ? ` (category: ${categoryLabel})` : ""}. Nigerian medical context. Include the original name.`,
        },
      ],
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as { synonyms?: string[] };
    return Array.from(new Set([testName, ...(parsed.synonyms ?? [])]));
  } catch {
    return [testName];
  }
}

/**
 * POST /api/admin/labs/[id]/catalog/resolve
 * Regenerates AI synonyms for a single lab offered test.
 * Body: { testId: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { testId } = await req.json();
  if (!testId) return NextResponse.json({ error: "testId required" }, { status: 400 });

  const existing = await prisma.labOfferedTest.findFirst({ where: { id: testId, lab_id: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const synonyms = await generateSynonyms(existing.raw_name, existing.category_label);

  const test = await prisma.labOfferedTest.update({
    where: { id: testId },
    data: { synonyms },
  });

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
