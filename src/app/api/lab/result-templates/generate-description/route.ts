export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getLabAuth } from "@/lib/lab-auth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/lab/result-templates/generate-description
 * Body: { name, department?, parameters?: string[] }
 * Returns a short plain-English description of the test plus a suggested emoji.
 * Requires can_manage_templates.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name: string = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Template name required" }, { status: 400 });
  const department: string = typeof body?.department === "string" ? body.department : "";
  const parameters: string[] = Array.isArray(body?.parameters) ? body.parameters.filter((p: unknown) => typeof p === "string").slice(0, 40) : [];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write short, plain-English explanations of medical laboratory and imaging tests for a patient-facing result report. " +
            "Explain what the test checks and what the results broadly mean (mention key thresholds/ranges only when widely standard). " +
            "2-4 sentences, warm but factual, no diagnosis, no advice to the specific patient. " +
            "Also choose ONE emoji that best represents the test. " +
            'Respond as JSON: {"description": string, "icon": string}.',
        },
        {
          role: "user",
          content: `Test: ${name}\nDepartment: ${department || "Laboratory"}\nParameters: ${parameters.join(", ") || "(not provided)"}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { description?: string; icon?: string };
    return NextResponse.json({
      description: (parsed.description ?? "").trim(),
      icon: (parsed.icon ?? "").trim().slice(0, 8),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status: 500 });
  }
}
