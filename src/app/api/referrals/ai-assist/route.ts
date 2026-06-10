export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { ALL_SPECIALTY_LABELS } from "@/lib/specialties";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BodySchema = z.object({
  mode: z.enum(["improve", "structure"]).default("improve"),
  note: z.string().trim().min(10).max(20000),
  patient: z
    .object({
      name: z.string().optional(),
      age: z.coerce.number().optional().nullable(),
      sex: z.string().optional().nullable(),
    })
    .optional(),
  specialty: z.string().optional(),
  diagnosis: z.string().optional(),
});

/**
 * POST /api/referrals/ai-assist
 * Polishes a doctor's draft referral note into a clean, structured clinical letter
 * and suggests the most appropriate specialty for the referral.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Write a draft note first (at least a few sentences)." }, { status: 400 });
    }
    const { note, patient, specialty, diagnosis } = parsed.data;

    const systemPrompt = `You are a clinical documentation assistant for Nigerian doctors writing patient referral letters.

Your job: rewrite the doctor's draft into a clear, professional referral note suitable for an inter-hospital referral in Nigeria.

RULES:
- Keep ALL clinical facts exactly as given. NEVER invent symptoms, findings, medications, doses, or results that are not in the draft.
- Organise the note under these headings (omit a heading if the draft has nothing for it):
  Presenting Complaint, History, Examination Findings, Investigations Done, Treatment Given, Reason for Referral.
- Use clear, formal medical English. Expand obvious abbreviations on first use (e.g. "BP (blood pressure)").
- Be concise — this is a working clinical letter, not an essay.
- If important information appears to be missing (e.g. no vital signs, no duration of symptoms, no treatment given), list up to 4 short suggestions of what the doctor could add.
- Also pick the single most appropriate receiving specialty from this list: ${ALL_SPECIALTY_LABELS.join(", ")}.

Respond ONLY with valid JSON in this exact shape:
{"note": "<the rewritten referral note with headings>", "suggestions": ["...", "..."], "specialty": "<one specialty from the list>"}`;

    const userPrompt = [
      patient?.name || patient?.age || patient?.sex
        ? `Patient: ${[patient?.name, patient?.age ? `${patient.age} years` : null, patient?.sex].filter(Boolean).join(", ")}`
        : null,
      diagnosis ? `Provisional diagnosis: ${diagnosis}` : null,
      specialty ? `Doctor's chosen specialty (keep unless clearly wrong): ${specialty}` : null,
      `Draft referral note:\n${note}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: { note?: string; suggestions?: string[]; specialty?: string };
    try {
      result = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "AI returned an unexpected response. Please try again." }, { status: 502 });
    }

    if (!result.note) {
      return NextResponse.json({ error: "AI could not improve the note. Please try again." }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      note: result.note,
      suggestions: Array.isArray(result.suggestions) ? result.suggestions.slice(0, 4) : [],
      specialty: result.specialty && ALL_SPECIALTY_LABELS.includes(result.specialty) ? result.specialty : null,
    });
  } catch (err) {
    console.error("[referrals/ai-assist]", err);
    return NextResponse.json({ error: "AI assist is unavailable right now. Please try again." }, { status: 500 });
  }
}
