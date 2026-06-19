import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Structured referral extracted from free text (typed or transcribed dictation).
// Mirrors extract-from-image so the UI treats every input source identically.
export interface ParsedReferral {
  tests: string[];
  diagnosis: string; // the full clinical note (indication + relevant history/findings)
  patient_name: string;
  patient_age: number | null;
  dob: string;
  sex: "male" | "female" | "";
  patient_phone: string;
  patient_email: string;
  schedule_hint: "today" | "this_week" | "this_month" | "";
}

export type ResolvedTest = { input: string; status: "resolved" | "ambiguous" | "unknown"; canonical?: string };

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
- "diagnosis" is the CLINICAL NOTE: capture the provisional diagnosis/indication AND any history, symptoms, examination findings, duration, or reason for the request that the doctor states — faithfully, in concise clinical wording. Do NOT put the test names here, and do NOT put the patient's name/age/phone/email here. Keep the doctor's own phrasing (e.g. "5/7 history of fever and headache, ?typhoid — for confirmation"). Empty string only if no clinical context at all is given.
- Never invent data that was not said. For anything not stated, return an empty string, empty array, or null.
- Age: if the doctor states an age in years, put the number in "patient_age". Only fill "dob" if an actual date of birth is given.
- "sex": "male" or "female" only if clearly indicated, else "".
- "patient_phone": digits only, if a phone number is dictated; else "".
- "patient_email": the patient's email if dictated. Spoken emails use words for symbols — convert "at" → "@" and "dot" → "." and remove spaces (e.g. "ada dot okafor at gmail dot com" → "ada.okafor@gmail.com"). Return "" if none.
- "schedule_hint": "today" if marked urgent/stat/today, "this_week", "this_month", else "".
Return ONLY the JSON object, no prose, no markdown.`;

const USER_TEMPLATE = (text: string) => `Doctor's dictation:
"""
${text}
"""

Return a JSON object with exactly these keys:
{
  "tests": ["Full Blood Count (FBC)", "Malaria Parasite (MP)"],
  "diagnosis": "the clinical note — indication plus relevant history/findings, empty string if none",
  "patient_name": "patient's full name, empty string if not stated",
  "patient_age": 42,
  "dob": "YYYY-MM-DD or empty string",
  "sex": "male, female, or empty string",
  "patient_phone": "digits only or empty string",
  "patient_email": "patient email or empty string",
  "schedule_hint": "today, this_week, this_month, or empty string"
}`;

/**
 * Parse a free-text referral into structured fields and resolve the tests
 * against the selected lab's catalogue. Shared by the /parse-text route (typed
 * input) and the /transcribe route (so voice is a single round-trip).
 * Throws on hard failures (e.g. OpenAI errors) — callers map to HTTP responses.
 */
export async function parseReferralText(
  text: string,
  labId: string | undefined,
  baseUrl: string
): Promise<{ parsed: ParsedReferral; resolvedTests: ResolvedTest[] | null }> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini", // fast + cheap, ample for plain-text extraction
    max_tokens: 900,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: USER_TEMPLATE(text) },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  if (!raw) throw new Error("empty_parse_response");

  const parsed = JSON.parse(raw) as ParsedReferral;

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
    patient_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(parsed.patient_email ?? "").trim())
      ? String(parsed.patient_email).trim().toLowerCase()
      : "",
    schedule_hint: ["today", "this_week", "this_month"].includes(String(parsed.schedule_hint))
      ? (String(parsed.schedule_hint) as ParsedReferral["schedule_hint"])
      : "",
  };

  // Resolve tests against the lab's catalogue so the UI can flag off-catalogue
  // items. Best-effort — never blocks the result.
  let resolvedTests: ResolvedTest[] | null = null;
  if (safe.tests.length > 0 && labId) {
    try {
      const resolveRes = await fetch(`${baseUrl}/api/tests/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labId, testInputs: safe.tests }),
      });
      if (resolveRes.ok) {
        const data = await resolveRes.json();
        resolvedTests = (data.results as ResolvedTest[]) ?? null;
      }
    } catch (err) {
      console.warn("[parse-referral] KB resolution skipped:", err);
    }
  }

  return { parsed: safe, resolvedTests };
}
