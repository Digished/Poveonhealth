import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a medical laboratory expert specialised in standardising lab test names.
You will receive a comma-separated list of lab test names that may contain:
- Typos or misspellings (e.g. "mls" → "MCS", "haemogramm" → "Haemogram")
- Incorrect abbreviations (e.g. "FBP" → "FBC", "LRT" → "LFT")
- Mixed casing that should be normalised
- Informal names that should be standardised

Rules:
- Return ONLY a valid JSON object: { "tests": ["Test 1", "Test 2", ...] }
- Keep tests in the same order as the input
- Fix spelling errors and incorrect abbreviations to their correct standard forms
- Use Title Case for multi-word tests, UPPERCASE for standard abbreviations (FBC, LFT, etc.)
- Never add, remove, or merge tests — keep exactly the same count as the input
- If a test is already correct, return it as-is
- Do not add explanations or prose — return only the JSON object`;

export async function POST(request: NextRequest) {
  try {
    const { tests } = await request.json();
    if (!tests || typeof tests !== "string" || !tests.trim()) {
      return NextResponse.json({ success: false, error: "tests string is required" }, { status: 400 });
    }

    const testList = tests.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean);
    if (testList.length === 0) {
      return NextResponse.json({ success: true, normalised: [] });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Normalise these lab tests:\n${testList.join(", ")}` },
      ],
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const normalised: string[] = Array.isArray(parsed.tests) ? parsed.tests : testList;

    return NextResponse.json({ success: true, normalised });
  } catch (e) {
    console.error("[normalize-tests] error:", e);
    // Return empty on failure — caller should fall back to local normalisation
    return NextResponse.json({ success: false, error: "Normalisation failed" }, { status: 500 });
  }
}
