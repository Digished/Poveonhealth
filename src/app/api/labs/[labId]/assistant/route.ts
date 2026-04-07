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
      const cat = t.category_label ? ` (${t.category_label})` : "";
      return `- ${t.raw_name}${cat}${syns ? ` | also known as: ${syns}` : ""}`;
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
- Prioritise tests from ${lab.name}'s catalog. Match symptoms creatively using the SYMPTOM GUIDE below.
- ${fallbackGuidance}
- Keep your message to 2–3 short, friendly sentences. No bullet lists in the message text.
- End every response with: "This is for informational purposes only and not a substitute for professional medical advice."
- Always include at least one suggestion unless the patient is clearly asking a non-health question.

SYMPTOM GUIDE — use catalog tests that correspond to these mappings:
- Cough (especially persistent >2 weeks), fever, night sweats, weight loss → suspect TB/respiratory infection: Sputum AFB, GeneXpert MTB/RIF, Sputum Culture, Chest X-ray, ESR, Full Blood Count
- Cough with chest tightness, shortness of breath → Chest X-ray, Sputum Culture, Full Blood Count, ESR
- Fatigue, weakness, pallor → Full Blood Count/CBC, Thyroid Function (TSH), Blood Glucose, Kidney Function, Liver Function, Iron Studies
- Frequent urination, excessive thirst, weight loss → Fasting Blood Sugar, Random Blood Sugar, HbA1c, Urinalysis
- Chest pain, palpitations → Lipid Profile, ECG (if available), Troponin, Full Blood Count
- Abdominal pain, nausea, vomiting, jaundice → Liver Function Test, H. pylori Antigen, Stool MCS, Hepatitis B/C
- Headache, dizziness → Full Blood Count, ESR, Blood Glucose, Thyroid
- Joint pain, swelling → ESR, CRP, Uric Acid, Rheumatoid Factor
- STI concerns, unprotected sex → HIV, Hepatitis B Surface Antigen, Syphilis VDRL/TPHA, NAAT (Chlamydia/Gonorrhoea)
- Skin rashes, itching → Full Blood Count, ESR, Hepatitis B/C, HIV, Thyroid
- General checkup / "I want to know my health status" → Full Blood Count, Fasting Blood Sugar, Lipid Profile, Liver Function, Kidney Function, Urinalysis, Thyroid (TSH)

${hasCatalog ? `${lab.name} AVAILABLE TESTS:\n${catalogText}` : "No catalog loaded — use standard general test names from the symptom guide above."}

RESPONSE FORMAT:
Write your 2–3 sentence friendly message. Then on a new line, output exactly this:
SUGGESTED_TESTS: TestName1 | TestName2 | TestName3

CRITICAL: In SUGGESTED_TESTS, write ONLY the test name — no category labels, no brackets, no extra text. Use the exact name from the catalog.
Include 1–4 tests. Omit the SUGGESTED_TESTS line only if the message is completely unrelated to health.`;

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

    // Extract structured suggestions from "SUGGESTED_TESTS: A | B | C" marker
    const suggestionMatch = rawContent.match(/^SUGGESTED_TESTS:\s*(.+)$/m);
    const suggestions: string[] = suggestionMatch
      ? suggestionMatch[1].split("|").map((s) => s.trim()).filter(Boolean)
      : [];

    // Clean message for display (strip the SUGGESTED_TESTS line)
    const message = rawContent.replace(/^SUGGESTED_TESTS:\s*.+$/mg, "").trim();

    return NextResponse.json({ message, suggestions });
  } catch (error) {
    console.error("[assistant] error:", error);
    return NextResponse.json(
      { error: "Assistant unavailable. Please try again." },
      { status: 500 }
    );
  }
}
