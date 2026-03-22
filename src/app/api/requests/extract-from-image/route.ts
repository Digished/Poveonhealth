import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ExtractedSlipData {
  tests_text: string;        // comma-separated or newline list ready for the textarea
  tests: string[];           // individual test names
  diagnosis: string;
  patient_name: string;
  dob: string;               // YYYY-MM-DD or ""
  sex: string;               // "male" | "female" | ""
  doctor_name: string;
  doctor_prefix: string;
  schedule_hint: string;     // "today" | "this_week" | "this_month" | ""
  confidence: "high" | "medium" | "low";
  low_confidence_items: string[]; // items Claude was unsure about
}

const SYSTEM_PROMPT = `You are a medical document OCR specialist.
You extract structured data from laboratory test request slips / doctor referral forms.
These may be handwritten, printed, or a mix of both.
Always return valid JSON exactly matching the schema — no prose, no markdown.
If a field cannot be determined, return an empty string or empty array as appropriate.
For test names, use standard medical abbreviations where well-known (e.g. FBC, LFT, RFT, U/E, PCV, WIDAL, ESR, CXR, ECG, ECHO, etc.) but always include the full name in parentheses if the abbreviation might be unclear.
Never invent data — only extract what is visibly present.`;

const USER_PROMPT = `Extract all clinical information from this test request slip.

Return ONLY a JSON object with this exact structure:
{
  "tests_text": "string — all requested tests as a newline-separated list, ready to paste into a form",
  "tests": ["array", "of", "individual", "test", "names"],
  "diagnosis": "clinical diagnosis or indication for the tests, empty string if not stated",
  "patient_name": "patient full name or empty string",
  "dob": "date of birth in YYYY-MM-DD format or empty string",
  "sex": "male or female or empty string",
  "doctor_name": "referring doctor's name WITHOUT title/prefix, or empty string",
  "doctor_prefix": "title only e.g. Dr. or Prof. or Nurse, or empty string",
  "schedule_hint": "today or this_week or this_month or empty string based on any urgency/timing written",
  "confidence": "high if text is clear and complete, medium if some parts are unclear, low if mostly unreadable",
  "low_confidence_items": ["list of specific items you were unsure about"]
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageUrl } = body as { imageUrl?: string };

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { success: false, error: "imageUrl is required" },
        { status: 400 }
      );
    }

    // Validate it's a URL we trust (Supabase storage or similar)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid image URL" },
        { status: 400 }
      );
    }

    // Only allow https URLs (not data: or file: etc.)
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { success: false, error: "Only HTTPS image URLs are supported" },
        { status: 400 }
      );
    }

    const response = await client.messages.create({
      // Haiku 4.5: fast (< 3 s) for real-time form auto-fill; vision-capable;
      // good enough for printed/handwritten medical slips.
      // Upgrade to claude-sonnet-4-6 for higher accuracy if needed.
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: imageUrl },
            },
            { type: "text", text: USER_PROMPT },
          ],
        },
      ],
    });

    // Extract the text block
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { success: false, error: "No text response from vision model" },
        { status: 500 }
      );
    }

    // Parse JSON — strip markdown fences if model wraps it
    let raw = textBlock.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    let extracted: ExtractedSlipData;
    try {
      extracted = JSON.parse(raw) as ExtractedSlipData;
    } catch {
      console.error("[extract-from-image] JSON parse failed:", raw);
      return NextResponse.json(
        { success: false, error: "Failed to parse extracted data" },
        { status: 500 }
      );
    }

    // Sanitise — ensure all expected fields exist
    const safe: ExtractedSlipData = {
      tests_text: String(extracted.tests_text ?? "").trim(),
      tests: Array.isArray(extracted.tests) ? extracted.tests.map(String) : [],
      diagnosis: String(extracted.diagnosis ?? "").trim(),
      patient_name: String(extracted.patient_name ?? "").trim(),
      dob: String(extracted.dob ?? "").trim(),
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
        ? extracted.low_confidence_items.map(String)
        : [],
    };

    return NextResponse.json({ success: true, extracted: safe });
  } catch (err) {
    console.error("[extract-from-image]", err);

    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { success: false, error: "AI service is busy. You can continue by typing the tests manually." },
        { status: 429 }
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { success: false, error: "AI extraction unavailable. Please type the tests manually." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Extraction failed. Please type the tests manually." },
      { status: 500 }
    );
  }
}
