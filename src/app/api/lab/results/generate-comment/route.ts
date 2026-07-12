export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getLabAuth } from "@/lib/lab-auth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Val = { name: string; value?: string; unit?: string; reference_range?: string; flag?: string };

/**
 * POST /api/lab/results/generate-comment
 * Body: { templateName?, department?, values: Val[] }
 * Returns a concise, editable interpretive comment for the entered results.
 * Requires can_view_requests (result-entry staff).
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const templateName: string = typeof body?.templateName === "string" ? body.templateName : "";
  const department: string = typeof body?.department === "string" ? body.department : "";
  const values: Val[] = Array.isArray(body?.values) ? body.values.slice(0, 60) : [];
  const filled = values.filter((v) => (v.value ?? "").toString().trim());
  if (filled.length === 0) return NextResponse.json({ error: "Enter some results first" }, { status: 400 });

  const lines = filled.map((v) => `- ${v.name}: ${v.value}${v.unit ? " " + v.unit : ""}${v.reference_range ? ` (ref ${v.reference_range})` : ""}${v.flag ? ` [${v.flag}]` : ""}`).join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are a laboratory scientist drafting a brief interpretive comment for a result report. " +
            "Summarise the pattern of results in 1-3 sentences: note which values are abnormal and their likely significance, and suggest correlation or a sensible next step where appropriate. " +
            "Be factual and cautious, avoid a definitive diagnosis, and do not address the patient directly. Output only the comment text.",
        },
        { role: "user", content: `Report: ${templateName || department || "Laboratory result"}\nResults:\n${lines}` },
      ],
    });
    const comment = (completion.choices[0]?.message?.content ?? "").trim();
    return NextResponse.json({ comment });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status: 500 });
  }
}
