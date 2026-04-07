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

    const hasCatalog = offeredTests.length > 0;

    const fallbackGuidance = hasCatalog
      ? `If the patient's concern doesn't match a specific test, look for foundational health screening tests in the catalog (e.g. Full Blood Count, CBC, ESR, Blood Glucose, Fasting Blood Sugar, Lipid Profile, Liver Function, Kidney Function, Urinalysis, Thyroid Function) and recommend the ones available.`
      : `Since no catalog is available, recommend general well-known tests by name (e.g. Full Blood Count/CBC, ESR, Blood Glucose, Lipid Profile, Liver Function Test, Kidney Function Test, Urinalysis) that are broadly applicable to the patient's concern. These are standard tests any lab can run.`;

    const systemPrompt = `You are the dedicated Health Assistant for ${lab.name} — a knowledgeable, warm, and proactive guide who helps patients understand exactly which tests they need.

YOUR GOALS:
1. Understand the patient's concern or symptoms quickly.
2. Recommend the most relevant tests confidently and explain in one sentence why each test matters for them.
3. Always recommend something — never leave the patient without a suggestion.
4. Be warm and reassuring: early testing leads to better health outcomes.

RULES:
- Never say "AI" or "artificial intelligence". You are a Health Assistant.
- Never diagnose conditions or interpret test results.
- Prioritise tests from ${lab.name}'s catalog below. Match symptoms creatively — e.g. fatigue → CBC, thyroid; chest discomfort → lipid profile, ECG if available; frequent urination → blood glucose, urinalysis.
- ${fallbackGuidance}
- Keep your message to 2–3 short, friendly sentences. No bullet lists in the message text.
- End every response with: "This is for informational purposes only and not a substitute for professional medical advice."
- Always include at least one suggestion unless the patient is clearly asking a non-health question.

${hasCatalog ? `${lab.name} AVAILABLE TESTS:\n${catalogText}` : "No catalog loaded — use general standard test names."}

RESPONSE FORMAT:
Write your brief friendly message, then on a new line append:
[SUGGESTIONS: ExactTestName1 | ExactTestName2 | ExactTestName3]

${hasCatalog ? "Use exact test names from the catalog above." : "Use standard accepted test names (e.g. Full Blood Count, ESR, Blood Glucose, Lipid Profile)."}
Include 1–4 suggestions. Omit [SUGGESTIONS: ...] only if the patient's message is completely unrelated to health.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 500,
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
