import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(2000),
    })
  ).min(1).max(20),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { labId: string } }
) {
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Verify lab exists
    const lab = await prisma.lab.findUnique({
      where: { id: params.labId },
      select: { id: true, name: true },
    });
    if (!lab) {
      return NextResponse.json({ error: "Lab not found" }, { status: 404 });
    }

    // Load lab's offered tests for context
    const offeredTests = await prisma.labOfferedTest.findMany({
      where: { lab_id: params.labId, is_active: true },
      select: { raw_name: true, category_label: true, synonyms: true },
      orderBy: { raw_name: "asc" },
    });

    const catalogLines = offeredTests.map((t) => {
      const syns = (Array.isArray(t.synonyms) ? t.synonyms as string[] : []).slice(0, 3).join(", ");
      const cat = t.category_label ? ` [${t.category_label}]` : "";
      return `- ${t.raw_name}${cat}${syns ? ` (also: ${syns})` : ""}`;
    });

    const catalogText = catalogLines.length > 0
      ? catalogLines.join("\n")
      : "No catalog available — do not suggest specific test names.";

    const systemPrompt = `You are a helpful Health Assistant for ${lab.name}. You help people understand which health checks or tests they might need based on their concerns.

IMPORTANT RULES:
- Never use the word "AI" or "artificial intelligence". You are a "Health Assistant".
- Only suggest tests that are in the lab's catalog below. Never invent test names.
- Never diagnose conditions or interpret results.
- Keep responses concise and friendly — 2 to 4 short sentences max, plus test suggestions.
- Always include this notice when making suggestions: "This is for informational purposes only and is not a substitute for professional medical advice."
- If the user's concern has no matching tests in the catalog, say so honestly and suggest they speak with a healthcare provider.
- Respond in plain language suitable for patients (not technical jargon).

${lab.name} AVAILABLE TESTS:
${catalogText}

RESPONSE FORMAT:
After your brief, friendly message, if you have test suggestions return them in this exact format at the end:
[SUGGESTIONS: TestName1 | TestName2 | TestName3]

Use exact names from the catalog above. Omit the [SUGGESTIONS: ...] line if no tests apply.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        ...parsed.data.messages,
      ],
    });

    const rawContent = response.choices[0]?.message?.content ?? "";

    // Extract structured suggestions from [SUGGESTIONS: A | B | C] marker
    const suggestionMatch = rawContent.match(/\[SUGGESTIONS:\s*([^\]]+)\]/);
    const suggestions: string[] = suggestionMatch
      ? suggestionMatch[1].split("|").map((s) => s.trim()).filter(Boolean)
      : [];

    // Clean message for display (strip the suggestion marker)
    const message = rawContent.replace(/\[SUGGESTIONS:[^\]]*\]/g, "").trim();

    return NextResponse.json({ message, suggestions });
  } catch (error) {
    console.error("[assistant] error:", error);
    return NextResponse.json(
      { error: "Assistant unavailable. Please try again." },
      { status: 500 }
    );
  }
}
