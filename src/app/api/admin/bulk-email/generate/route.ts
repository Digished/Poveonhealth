export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BodySchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
  audience: z.string().trim().max(120).optional(),
});

const SYSTEM = `You write marketing and announcement emails for Poveon Health, a Nigerian healthcare platform connecting doctors, patients, labs and marketers.

Given a short brief, produce a polished, warm, professional email. Rules:
- Return ONLY valid JSON: {"subject": "...", "html": "..."}.
- "html" is the EMAIL BODY ONLY (no <html>, <head> or <body> — it will be wrapped in Poveon's branded template).
- Use simple semantic HTML: <h2>, <p>, <ul>/<li>, <a>, <strong>. Add inline styles sparingly and on-brand: headings color #0259a0; links color #0270c3. Buttons as <a> with style "display:inline-block;background:#0270c3;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;".
- Keep it concise and skimmable. Address the reader warmly ("Hi there," is fine — do not invent a specific name).
- Nigerian English, friendly and trustworthy. No spammy ALL-CAPS. End with a brief sign-off from "The Poveon Health Team".
- Subject line: clear, compelling, under 80 characters, no emojis unless the brief asks.`;

/** POST /api/admin/bulk-email/generate — draft an email subject + body with AI. */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Describe the email you want." }, { status: 400 });

    const userMsg = parsed.data.audience
      ? `Audience: ${parsed.data.audience}\nBrief: ${parsed.data.prompt}`
      : parsed.data.prompt;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.6,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let out: { subject?: string; html?: string };
    try { out = JSON.parse(raw); } catch { return NextResponse.json({ error: "Could not generate. Try again." }, { status: 502 }); }
    if (!out.subject || !out.html) return NextResponse.json({ error: "Could not generate. Try again." }, { status: 502 });

    return NextResponse.json({ success: true, subject: out.subject.trim(), html: out.html.trim() });
  } catch (err) {
    console.error("[bulk-email/generate]", err);
    return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 500 });
  }
}
