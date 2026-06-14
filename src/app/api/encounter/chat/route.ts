export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BodySchema = z.object({
  slug: z.string().trim().min(1),
  imageUrls: z.array(z.string().url()).max(5).default([]),
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

function systemPrompt(doctorName: string, specialty: string | null): string {
  const who = specialty ? `${doctorName}, a ${specialty},` : doctorName;
  return `You are a friendly, professional medical intake assistant working for ${who} in Nigeria. A patient is requesting a consultation. Your ONLY job is to gather a clear history for the doctor, who will review everything and follow up.

STRICT RULES:
- You are gathering information, NOT diagnosing. NEVER give a diagnosis, name a likely condition, or recommend specific treatments/medications. If asked "what is this?", warmly explain the doctor will review and reach out, and continue gathering history.
- Ask ONE question at a time. Keep each message short, warm and plain-English (avoid jargon).
- If photos were uploaded, look at them to make your questions specific and relevant.
- Cover the essentials over the conversation: the main complaint; when it started; how it has changed; associated symptoms; relevant history, medications and allergies; and anything already tried.${specialty ? ` Tailor your questions to ${specialty}.` : ""}
- Do not re-ask something already answered. Adapt to the answers.
- Ask at most 6-7 questions total. Once you have enough for the doctor to act, STOP asking and write a brief, warm closing message telling them they can now enter their details, choose a plan, and submit, and that the doctor will follow up.

Respond ONLY with valid JSON in this exact shape:
{"message": "<your single next question, or the closing message>", "done": <true ONLY when finished gathering and the message is the closing message, otherwise false>}`;
}

export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json({ error: first?.message ?? "Invalid request." }, { status: 400 });
    }
    const { slug, imageUrls, messages } = parsed.data;

    const profile = await prisma.doctorProfile.findUnique({ where: { encounter_slug: slug.toLowerCase() } });
    if (!profile) return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
    const doctorName = [profile.prefix, profile.full_name].filter(Boolean).join(" ").trim() || "your doctor";

    const imageParts = imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url, detail: "low" as const },
    }));

    const userIntro =
      messages.length === 0
        ? imageUrls.length > 0
          ? "Here are my photo(s). Please start the intake."
          : "Please start the intake."
        : imageUrls.length > 0
          ? "These are my uploaded photo(s) for context."
          : "Continuing the intake.";

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt(doctorName, profile.specialty) },
      {
        role: "user",
        content: [{ type: "text", text: userIntro }, ...imageParts],
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
      return NextResponse.json({
        message: "Thanks. Could you tell me a little more about when this first started?",
        done: false,
      });
    }

    if (!result.message) {
      return NextResponse.json({
        message: "Thank you. You can now enter your details, choose a plan, and submit — your doctor will follow up.",
        done: true,
      });
    }

    const patientTurns = messages.filter((m) => m.role === "user").length;
    const done = result.done === true || patientTurns >= 7;

    return NextResponse.json({ message: result.message, done });
  } catch (err) {
    console.error("[encounter/chat]", err);
    return NextResponse.json({ error: "The assistant is unavailable right now. Please try again." }, { status: 500 });
  }
}
