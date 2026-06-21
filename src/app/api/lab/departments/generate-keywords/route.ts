export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { getLabAuth } from "@/lib/lab-auth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().min(3).max(2000),
});

/**
 * POST /api/lab/departments/generate-keywords
 * Given a department name and a plain-English description of what it does,
 * returns a set of lowercase routing keywords. These are matched against each
 * test's category/name to route it into the department.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Tell us the department name and what it does first." }, { status: 400 });
  }
  const { name, description } = parsed.data;

  const systemPrompt = `You configure routing for a medical laboratory's LIMS.

A "department" groups lab tests into a pipeline. Each department has a list of lowercase keywords. When a test's category or name CONTAINS one of the keywords, the test is routed to that department.

Your job: given a department name and a description of what it does, produce a focused set of routing keywords.

RULES:
- Output 8-20 keywords, all lowercase.
- Prefer short, high-signal stems that will substring-match many related test names (e.g. "hematolog", "microbiolog", "ultrasound", "x-ray", "ct scan", "fbc", "lipid").
- Include common test names, abbreviations, sample types and modalities relevant to the department.
- Do NOT include generic words like "test", "lab", "result", "patient".
- No duplicates. No explanations.

Respond ONLY with valid JSON: {"keywords": ["...", "..."]}`;

  const userPrompt = `Department: ${name}\nWhat it does: ${description}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: { keywords?: unknown };
    try { result = JSON.parse(raw); } catch {
      return NextResponse.json({ error: "AI returned an unexpected response. Please try again." }, { status: 502 });
    }
    const keywords = Array.isArray(result.keywords)
      ? Array.from(new Set(result.keywords.map((k) => String(k).trim().toLowerCase()).filter((k) => k && k.length <= 40))).slice(0, 24)
      : [];
    if (keywords.length === 0) {
      return NextResponse.json({ error: "Couldn't generate keywords — try describing the department in more detail." }, { status: 502 });
    }
    return NextResponse.json({ success: true, keywords });
  } catch (err) {
    console.error("[departments/generate-keywords]", err);
    return NextResponse.json({ error: "AI is unavailable right now. Please try again." }, { status: 500 });
  }
}
