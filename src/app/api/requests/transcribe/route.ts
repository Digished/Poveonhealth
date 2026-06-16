import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { parseReferralText } from "@/lib/parse-referral";

export const runtime = "nodejs";
export const maxDuration = 60;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Biases the speech model toward Nigerian-English clinical dictation and the lab
// vocabulary doctors actually use. The browser Web Speech API can't be steered
// like this, which is why accents and abbreviations were getting mangled.
const TRANSCRIBE_PROMPT = `This is a Nigerian doctor dictating a laboratory test request in Nigerian-accented English.
Expect medical abbreviations and Nigerian lab terminology such as: FBC (Full Blood Count), WIDAL, MP/MPS (Malaria Parasite), U/E/Cr or E/U/Cr (Urea, Electrolytes and Creatinine), LFT (Liver Function Test), RFT (Renal Function Test), PCV, ESR, RBS, FBS, 2HrPP, HbA1c, PSA, RVS/HIV, HBsAg, HCV, Genotype, Blood Group, Urinalysis, Urine M/C/S, Stool M/C/S, Lipid Profile, TSH, FT3, FT4, Serum Electrolytes, Clotting Profile, CXR, ECG, ECHO, Abdominal USS, Pelvic Scan.
Also expect patient names, ages in years, sex, and a clinical indication (e.g. "query typhoid", "poorly controlled diabetes"). Transcribe what is said accurately.`;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const labId = (form.get("labId") as string) || undefined;
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ success: false, error: "No audio received." }, { status: 400 });
    }
    if (audio.size > 25 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: "Recording too long." }, { status: 413 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    // Derive an extension OpenAI accepts from the blob's mime type.
    const type = audio.type || "audio/webm";
    const ext = type.includes("mp4") || type.includes("m4a") ? "mp4"
      : type.includes("ogg") ? "ogg"
      : type.includes("wav") ? "wav"
      : type.includes("mpeg") || type.includes("mp3") ? "mp3"
      : "webm";
    const file = await toFile(buffer, `dictation.${ext}`, { type });

    const transcribe = (model: string) =>
      client.audio.transcriptions.create({
        file,
        model,
        language: "en",
        prompt: TRANSCRIBE_PROMPT,
        temperature: 0,
      });

    let text = "";
    try {
      const res = await transcribe("gpt-4o-transcribe");
      text = res.text ?? "";
    } catch (e) {
      // Fall back to whisper-1 if the newer model isn't enabled on this key.
      console.warn("[transcribe] gpt-4o-transcribe failed, falling back to whisper-1:", e);
      const res = await transcribe("whisper-1");
      text = res.text ?? "";
    }

    text = text.trim();
    if (!text) {
      return NextResponse.json({ success: false, error: "Didn't catch that — please try again." }, { status: 422 });
    }

    // Parse in the same request so the client only makes one round-trip.
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
      const { parsed, resolvedTests } = await parseReferralText(text, labId, baseUrl);
      return NextResponse.json({ success: true, text, parsed, resolvedTests });
    } catch (parseErr) {
      // Transcription worked but parsing failed — return the text so the client
      // can still fall back to the typed parse path.
      console.error("[transcribe] parse step failed:", parseErr);
      return NextResponse.json({ success: true, text, parsed: null, resolvedTests: null });
    }
  } catch (err) {
    console.error("[transcribe]", err);
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 429) {
      return NextResponse.json({ success: false, error: "Voice service is busy. Type the details instead." }, { status: 429 });
    }
    return NextResponse.json({ success: false, error: "Transcription failed. Please type the details instead." }, { status: 500 });
  }
}
