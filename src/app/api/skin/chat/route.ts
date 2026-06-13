export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BodySchema = z.object({
  imageUrls: z.array(z.string().url()).min(1, "At least one photo is required.").max(5),
  messages: z
    .array(
      z.object({
        role: z.enum(["assistant", "user"]),
        content: z.string().max(2000),
      })
    )
    .max(40)
    .default([]),
});

const SYSTEM_PROMPT = `You are a friendly, professional dermatology intake assistant for an async teledermatology service in Nigeria. A patient has uploaded photo(s) of a skin complaint. Your ONLY job is to gather a clear clinical history for a human dermatologist who will review everything later and follow up on WhatsApp.

STRICT RULES:
- You are gathering information, NOT diagnosing. NEVER give a diagnosis, name a likely condition, or recommend specific treatments/medications. If the patient asks "what is this?", warmly explain that a dermatologist will review their photos and reach out, and continue gathering history.
- Ask ONE question at a time. Keep each message short, warm and plain-English (avoid jargon).
- Look at the uploaded photo(s) to make your questions specific and relevant to what is visible.
- Cover the essentials over the conversation: when they first noticed it; how it has changed (spreading, growing, fading); symptoms (itch, pain, burning, bleeding, discharge); location(s) on the body and whether it has spread; any triggers (new products, foods, medications, soaps, detergents, sun, travel); whether anyone close to them has something similar; relevant medical history or allergies; what (if anything) they have already tried.
- Do not re-ask something the patient already answered. Adapt to their answers.
- Ask at most 6-7 questions in total. Once you have enough for a dermatologist to act, STOP asking and write a brief, warm closing message telling them they can now enter their details and submit, and that a dermatologist will reach out on WhatsApp.

Respond ONLY with valid JSON in this exact shape:
{"message": "<your single next question, or the closing message>", "done": <true ONLY when you are finished gathering and the message is the closing message, otherwise false>}`;

export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json({ error: first?.message ?? "Invalid request." }, { status: 400 });
    }
    const { imageUrls, messages } = parsed.data;

    // Build the multimodal conversation. The images ride along with the first user turn.
    const imageParts = imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "low" as const },
    }));

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              messages.length === 0
                ? "Here are my photo(s). Please start the intake."
                : "These are my uploaded photo(s) for context.",
          },
          ...imageParts,
        ],
      },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.5,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: chatMessages,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let result: { message?: string; done?: boolean };
    try {
      result = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { message: "Thanks. Could you tell me a little more about when you first noticed this?", done: false }
      );
    }

    if (!result.message) {
      return NextResponse.json(
        { message: "Thank you. You can now enter your details and submit — a dermatologist will reach out on WhatsApp.", done: true }
      );
    }

    // Safety cap: never let the AI loop forever — force completion after enough turns
    const patientTurns = messages.filter((m) => m.role === "user").length;
    const done = result.done === true || patientTurns >= 7;

    return NextResponse.json({ message: result.message, done });
  } catch (err) {
    console.error("[skin/chat]", err);
    return NextResponse.json({ error: "The assistant is unavailable right now. Please try again." }, { status: 500 });
  }
}
