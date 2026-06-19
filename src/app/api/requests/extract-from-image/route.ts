import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ExtractedSlipData {
  tests_text: string;            // newline-separated list ready for the textarea
  tests: string[];               // individual test names
  diagnosis: string;
  patient_name: string;
  dob: string;                   // YYYY-MM-DD or ""
  patient_age: number | null;    // age in years if stated on the slip
  sex: string;                   // "male" | "female" | ""
  doctor_name: string;
  doctor_prefix: string;
  schedule_hint: string;         // "today" | "this_week" | "this_month" | ""
  confidence: "high" | "medium" | "low";
  low_confidence_items: string[];
}

const SYSTEM_PROMPT = `You are a specialist in reading medical laboratory test request slips and doctor referral forms.
Your job is to extract all clinical information from the image provided.
The slips may be handwritten, printed, stamped, or a combination.
You must return ONLY a valid JSON object — no prose, no markdown, no commentary.
Follow these rules strictly:
- List every individual test as a separate entry in the "tests" array.
- Use full test names. If a standard abbreviation is clear (FBC, LFT, RFT, U/E, PCV, ESR, WIDAL, CXR, ECG, ECHO, HbA1c, PSA, etc.) include both: e.g. "Full Blood Count (FBC)".
- Never invent or guess data that is not visible in the image.
- For any field not visible or unreadable, return an empty string or empty array.
- "low_confidence_items" must list the exact test names or field values you were uncertain about.`;

const USER_PROMPT = `Extract all clinical data from this test request slip and return a JSON object with exactly these fields:

{
  "tests_text": "all requested tests as a newline-separated list — e.g. Full Blood Count (FBC)\\nLiver Function Test (LFT)\\nUrinalysis",
  "tests": ["Full Blood Count (FBC)", "Liver Function Test (LFT)", "Urinalysis"],
  "diagnosis": "clinical diagnosis or indication written on the slip, empty string if absent",
  "patient_name": "patient's full name as written, empty string if not found",
  "dob": "date of birth in YYYY-MM-DD format, empty string if not found",
  "patient_age": "age in years as a number if the slip states an age, otherwise null",
  "sex": "male or female (lowercase), empty string if not determinable",
  "doctor_name": "referring doctor's name WITHOUT any title or prefix, empty string if not found",
  "doctor_prefix": "title only e.g. Dr. or Prof. or Nurse or Pharm., empty string if not found",
  "schedule_hint": "today if marked urgent/STAT/today, this_week if within the week, this_month if within the month, empty string otherwise",
  "confidence": "high if the slip is clearly readable, medium if some parts are unclear or partially legible, low if mostly unreadable or heavily obscured",
  "low_confidence_items": ["exact names of tests or fields you were uncertain about reading correctly"]
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl, labId } = body as { imageUrl?: string; labId?: string };

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { success: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    if (!labId || typeof labId !== "string") {
      return NextResponse.json(
        { success: false, error: "labId is required" },
        { status: 400 }
      );
    }

    // Only allow https image URLs
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid image URL" },
        { status: 400 }
      );
    }
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { success: false, error: "Only HTTPS image URLs are supported" },
        { status: 400 }
      );
    }

    // GPT-4o: best-in-class OCR and vision, handles handwritten medical text well.
    // response_format json_object guarantees valid JSON — no parsing surprises.
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high", // high-res mode for reading fine text & handwriting
              },
            },
            {
              type: "text",
              text: USER_PROMPT,
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    if (!raw) {
      return NextResponse.json(
        { success: false, error: "No response from vision model" },
        { status: 500 }
      );
    }

    let extracted: ExtractedSlipData;
    try {
      // json_object mode guarantees valid JSON so this should never throw
      extracted = JSON.parse(raw) as ExtractedSlipData;
    } catch {
      console.error("[extract-from-image] JSON parse failed:", raw);
      return NextResponse.json(
        { success: false, error: "Failed to parse extracted data" },
        { status: 500 }
      );
    }

    // Sanitise — coerce types and validate enum values
    const safe: ExtractedSlipData = {
      tests_text: String(extracted.tests_text ?? "").trim(),
      tests: Array.isArray(extracted.tests)
        ? extracted.tests.map(String).filter(Boolean)
        : [],
      diagnosis: String(extracted.diagnosis ?? "").trim(),
      patient_name: String(extracted.patient_name ?? "").trim(),
      dob: String(extracted.dob ?? "").trim(),
      patient_age:
        typeof extracted.patient_age === "number" && extracted.patient_age > 0 && extracted.patient_age < 130
          ? Math.round(extracted.patient_age)
          : null,
      sex: ["male", "female"].includes(String(extracted.sex).toLowerCase())
        ? (String(extracted.sex).toLowerCase() as "male" | "female")
        : "",
      doctor_name: String(extracted.doctor_name ?? "").trim(),
      doctor_prefix: String(extracted.doctor_prefix ?? "").trim(),
      schedule_hint: ["today", "this_week", "this_month"].includes(
        String(extracted.schedule_hint)
      )
        ? String(extracted.schedule_hint)
        : "",
      confidence: ["high", "medium", "low"].includes(
        String(extracted.confidence)
      )
        ? (String(extracted.confidence) as "high" | "medium" | "low")
        : "medium",
      low_confidence_items: Array.isArray(extracted.low_confidence_items)
        ? extracted.low_confidence_items.map(String).filter(Boolean)
        : [],
    };

    // Resolve extracted tests against KB for the selected lab
    let resolvedTests: any = null;
    if (safe.tests.length > 0) {
      try {
        const resolveResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/tests/resolve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              labId,
              testInputs: safe.tests,
            }),
          }
        );

        if (resolveResponse.ok) {
          const resolveData = await resolveResponse.json();
          resolvedTests = resolveData.results || null;
          console.log("[extract-from-image] Resolved tests:", resolvedTests);
        } else {
          console.warn("[extract-from-image] KB resolve failed, returning raw extraction");
        }
      } catch (err) {
        console.warn("[extract-from-image] KB resolution error:", err);
        // Continue anyway - return raw extraction
      }
    }

    return NextResponse.json({
      success: true,
      extracted: safe,
      resolvedTests, // Include resolved tests if KB resolution succeeded
    });
  } catch (err) {
    console.error("[extract-from-image]", err);

    // OpenAI error types
    if (err && typeof err === "object" && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 429) {
        return NextResponse.json(
          { success: false, error: "AI service is busy. You can continue by typing the tests manually." },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: "Extraction failed. Please type the tests manually." },
      { status: 500 }
    );
  }
}
