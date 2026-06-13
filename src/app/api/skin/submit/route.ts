export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { skinConsultPatient, skinConsultAdmin } from "@/lib/email/templates";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().max(4000),
});

const BodySchema = z.object({
  patient_name: z.string().trim().min(2).max(120),
  patient_email: z.string().email(),
  patient_whatsapp: z.string().trim().min(7).max(25),
  patient_age: z.coerce.number().int().min(0).max(120).optional().nullable(),
  patient_sex: z.enum(["male", "female", "other"]).optional().nullable(),
  image_urls: z.array(z.string().url()).min(1, "At least one photo is required.").max(5),
  conversation: z.array(MessageSchema).max(40).default([]),
});

/** Generate a concise clinical summary for the reviewing dermatologist (best-effort). */
async function buildSummary(conversation: { role: string; content: string }[]): Promise<string | null> {
  if (conversation.length === 0) return null;
  try {
    const transcript = conversation
      .map((m) => `${m.role === "user" ? "Patient" : "Assistant"}: ${m.content}`)
      .join("\n");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 350,
      messages: [
        {
          role: "system",
          content:
            "You summarise a teledermatology intake chat for a dermatologist. Write a concise clinical summary (3-6 lines) covering: onset/duration, location, symptoms, progression, triggers, and anything already tried. Use only facts stated by the patient. Do NOT diagnose or recommend treatment. Plain prose, no headings.",
        },
        { role: "user", content: transcript },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("[skin/submit] summary failed:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid submission." },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const code = await generateUniqueCode("SKN", async (candidate) => {
      const existing = await prisma.skinConsult.findUnique({ where: { code: candidate }, select: { id: true } });
      return !!existing;
    });

    const aiSummary = await buildSummary(data.conversation);

    const consult = await prisma.skinConsult.create({
      data: {
        code,
        patient_name: data.patient_name,
        patient_email: data.patient_email.trim().toLowerCase(),
        patient_whatsapp: data.patient_whatsapp.trim(),
        patient_age: data.patient_age ?? null,
        patient_sex: data.patient_sex ?? null,
        image_urls: data.image_urls,
        conversation: data.conversation,
        ai_summary: aiSummary,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";

    // Notify the patient (confirmation) — wait so we can report a hard failure
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: consult.patient_email,
        subject: `Your skin consultation — ${code}`,
        html: skinConsultPatient({ patientName: consult.patient_name, code }),
      });
    } catch (e) {
      console.error("[skin/submit] patient email failed:", e);
    }

    // Notify admin with the full conversation + photos — fire-and-forget
    const adminEmail = process.env.ADMIN_ALERT_EMAIL;
    if (adminEmail) {
      resend.emails
        .send({
          from: FROM_ADDRESS,
          to: adminEmail,
          subject: `🩺 New skin consultation — ${code} (${consult.patient_name})`,
          html: skinConsultAdmin({
            code,
            patientName: consult.patient_name,
            patientEmail: consult.patient_email,
            patientWhatsapp: consult.patient_whatsapp,
            patientAge: consult.patient_age,
            patientSex: consult.patient_sex,
            imageUrls: consult.image_urls,
            conversation: data.conversation,
            aiSummary,
            dashboardUrl: `${appUrl}/admin`,
          }),
        })
        .then(({ error }) => { if (error) console.error("[skin/submit] admin email:", JSON.stringify(error)); })
        .catch((e) => console.error("[skin/submit] admin email error:", e));
    } else {
      console.warn("[skin/submit] ADMIN_ALERT_EMAIL not set — admin not notified");
    }

    return NextResponse.json({ success: true, code, consultId: consult.id });
  } catch (err) {
    console.error("[skin/submit]", err);
    return NextResponse.json({ error: "Failed to submit your consultation. Please try again." }, { status: 500 });
  }
}
