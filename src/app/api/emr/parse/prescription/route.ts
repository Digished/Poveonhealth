export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getStaffFromRequest } from "@/lib/emr-auth";
import { parsePrescription, type ParsedRxItem } from "@/lib/emr/prescription";

const SYSTEM_PROMPT = `You are a clinical pharmacist that converts a doctor's shorthand prescription into structured JSON.
Input is free text, possibly several drugs on separate lines, using medical abbreviations.
Return ONLY a JSON object: { "items": [ { drug_name, strength, form, dose, route, frequency, frequency_per_day, duration_days, quantity, instructions } ] }
Rules:
- drug_name: the medication's proper generic/brand name, correctly spelled and Title Cased (expand obvious abbreviations, e.g. "pcm" -> "Paracetamol", "amox" -> "Amoxicillin"). Never invent a drug.
- strength: e.g. "1g", "500mg" (null if absent).
- form: one of tablet, capsule, syrup, suspension, injection, infusion, suppository, cream, ointment, drops, inhaler, sachet (null if unclear).
- route: PO, IV, IM, SC, PR, PV, topical, inhaled, SL (null if unclear).
- frequency: keep the canonical abbreviation (od, bd, tds, qds, stat, prn, nocte, mane, q6h, etc.).
- frequency_per_day: integer times per day (od=1, bd=2, tds=3, qds=4, q6h=4, q8h=3; null for prn/stat-with-no-repeat).
- duration_days: integer days. Expand "x5/7"=5 days, "x2/52"=14 days, "x1/12"=30 days, "x5 days"=5.
- instructions: extra notes like "after food", "as needed" (null if none).
- Keep one item per drug, in input order. Do not add explanations. Return only JSON.`;

/**
 * POST /api/emr/parse/prescription
 * Body: { text }
 * Returns structured prescription items. A local heuristic parser always runs;
 * the LLM (when configured) refines drug names and fills gaps.
 */
export async function POST(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ success: true, items: [] });
    }

    // 1) Always compute a local parse as the reliable fallback.
    const local = parsePrescription(text);

    // 2) If OpenAI is configured, refine. Fall back silently on any failure.
    if (process.env.OPENAI_API_KEY) {
      try {
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Parse this prescription:\n${text}` },
          ],
          max_tokens: 700,
        });
        const raw = response.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items) && parsed.items.length) {
          const items: ParsedRxItem[] = parsed.items.map(
            (it: Record<string, unknown>, idx: number) => ({
              drug_name: String(it.drug_name ?? local[idx]?.drug_name ?? "").trim() || "Unknown",
              strength: (it.strength as string) ?? local[idx]?.strength ?? null,
              form: (it.form as string) ?? local[idx]?.form ?? null,
              dose: (it.dose as string) ?? local[idx]?.dose ?? null,
              route: (it.route as string) ?? local[idx]?.route ?? null,
              frequency: (it.frequency as string) ?? local[idx]?.frequency ?? null,
              frequency_per_day:
                it.frequency_per_day != null ? Number(it.frequency_per_day) : local[idx]?.frequency_per_day ?? null,
              duration_days:
                it.duration_days != null ? Number(it.duration_days) : local[idx]?.duration_days ?? null,
              quantity: (it.quantity as string) ?? null,
              instructions: (it.instructions as string) ?? local[idx]?.instructions ?? null,
              raw_fragment: local[idx]?.raw_fragment ?? "",
              confidence: 0.9,
            })
          );
          return NextResponse.json({ success: true, items, source: "ai" });
        }
      } catch (e) {
        console.error("[emr/parse/prescription] AI refine failed, using local:", e);
      }
    }

    return NextResponse.json({ success: true, items: local, source: "local" });
  } catch (err) {
    console.error("[emr/parse/prescription]", err);
    return NextResponse.json({ error: "Failed to parse prescription." }, { status: 500 });
  }
}
