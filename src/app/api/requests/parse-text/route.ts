import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Shape returned to the Fast Mode composer. Mirrors extract-from-image so the
// frontend can treat voice/typed dictation and a photographed slip identically.
export interface ParsedReferral {
  tests: string[]; // individual test names
  diagnosis: string; // clinical indication / provisional diagnosis
  patient_name: string;
  patient_age: number | null; // age in years if stated
  dob: string; // YYYY-MM-DD if a real DOB is given, else ""
  sex: "male" | "female" | "";
  patient_phone: string; // digits only if dictated, else ""
  schedule_hint: "today" | "this_week" | "this_month" | "";
}

const SYSTEM_PROMPT = `You are a clinical scribe for a Nigerian laboratory referral platform.
A doctor dictates or types, in free natural language, a request for laboratory tests for a patient.
Your job is to turn that into a single structured JSON object — nothing else.
The input is often an imperfect speech-to-text transcription of a Nigerian-accented doctor, so
silently correct obvious mis-hearings of lab terms before extracting. Common corrections:
"wider"/"why doll"/"vidal" → WIDAL; "if B C"/"FBC"/"full blood count" → Full Blood Count (FBC);
"you and E"/"U and E"/"urea and electrolyte(s)" → U/E/Cr; "magnesium parasite"/"malaria parasites" → Malaria Parasite (MP);
"liver function" → Liver Function Test (LFT); "renal function" → Renal Function Test (RFT);
"PCV"/"packed cell volume", "ESR", "RBS"/"random blood sugar", "FBS"/"fasting blood sugar",
"HbA1c"/"H B A one C", "genotype", "blood group", "urinalysis", "lipid profile". Use clinical judgement.
Rules:
- Extract EVERY laboratory test the doctor mentions as a separate entry in "tests".
- Use full test names. When a standard abbreviation is clear (FBC, LFT, RFT, U/E, E/U/Cr, PCV, ESR, WIDAL, MP/MPS, RBS/FBS, HbA1c, PSA, RVS/HIV, HBsAg, Urinalysis, etc.) expand it but keep the abbreviation, e.g. "Full Blood Count (FBC)", "Malaria Parasite (MP)".
- "diagnosis" is the clinical indication or provisional diagnosis (e.g. "?Typhoid fever", "Poorly controlled diabetes"). Empty string if none stated.
- Never invent data that was not said. For anything not stated, return an empty string, empty array, or null.
- Age: if the doctor states an age in years, put the number in "patient_age". Only fill "dob" if an actual date of birth is given.
- "sex": "male" or "female" only if clearly indicated, else "".
- "patient_phone": digits only, if a phone number is dictated; else "".
- "schedule_hint": "today" if marked urgent/stat/today, "this_week", "this_month", else "".
Return ONLY the JSON object, no prose, no markdown.`;

const USER_TEMPLATE = (text: string) => `Doctor's dictation:
"""
${text}
"""

Return a JSON object with exactly these keys:
{
  "tests": ["Full Blood Count (FBC)", "Malaria Parasite (MP)"],
  "diagnosis": "clinical indication, empty string if none",
  "patient_name": "patient's full name, empty string if not stated",
  "patient_age": 42,
  "dob": "YYYY-MM-DD or empty string",
  "sex": "male, female, or empty string",
  "patient_phone": "digits only or empty string",
  "schedule_hint": "today, this_week, this_month, or empty string"
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, labId } = body as { text?: string; labId?: string };

    if (!text || typeof text !== "string" || text.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: "Please dictate or type the referral first." },
        { status: 400 }
      );
    }
    if (text.length > 4000) {
      return NextResponse.json(
        { success: false, error: "That note is too long to parse." },
        { status: 400 }
      );
    }

    // gpt-4o-mini is fast and cheap and more than capable for plain-text extraction.
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_TEMPLATE(text) },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    if (!raw) {
      return NextResponse.json(
        { success: false, error: "Could not understand the dictation. Try again or type it." },
        { status: 502 }
      );
    }

    let parsed: ParsedReferral;
    try {
      parsed = JSON.parse(raw) as ParsedReferral;
    } catch {
      console.error("[parse-text] JSON parse failed:", raw);
      return NextResponse.json(
        { success: false, error: "Failed to parse the dictation." },
        { status: 502 }
      );
    }

    const ageNum =
      typeof parsed.patient_age === "number" && parsed.patient_age > 0 && parsed.patient_age < 130
        ? Math.round(parsed.patient_age)
        : null;

    const safe: ParsedReferral = {
      tests: Array.isArray(parsed.tests) ? parsed.tests.map(String).map((t) => t.trim()).filter(Boolean) : [],
      diagnosis: String(parsed.diagnosis ?? "").trim(),
      patient_name: String(parsed.patient_name ?? "").trim(),
      patient_age: ageNum,
      dob: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.dob ?? "")) ? String(parsed.dob) : "",
      sex: ["male", "female"].includes(String(parsed.sex).toLowerCase())
        ? (String(parsed.sex).toLowerCase() as "male" | "female")
        : "",
      patient_phone: String(parsed.patient_phone ?? "").replace(/[^\d+]/g, ""),
      schedule_hint: ["today", "this_week", "this_month"].includes(String(parsed.schedule_hint))
        ? (String(parsed.schedule_hint) as ParsedReferral["schedule_hint"])
        : "",
    };

    // Resolve extracted tests against the selected lab's catalog so the UI can
    // flag which ones are in-catalog. Best-effort: never blocks the response.
    let resolvedTests: unknown = null;
    if (safe.tests.length > 0 && labId) {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
        const resolveRes = await fetch(`${base}/api/tests/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labId, testInputs: safe.tests }),
        });
        if (resolveRes.ok) {
          const data = await resolveRes.json();
          resolvedTests = data.results ?? null;
        }
      } catch (err) {
        console.warn("[parse-text] KB resolution skipped:", err);
      }
    }

    return NextResponse.json({ success: true, parsed: safe, resolvedTests });
  } catch (err) {
    console.error("[parse-text]", err);
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 429) {
      return NextResponse.json(
        { success: false, error: "AI service is busy. Type the details instead." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Parsing failed. Please type the details instead." },
      { status: 500 }
    );
  }
}
