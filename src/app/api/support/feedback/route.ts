export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { supportFeedbackEmail } from "@/lib/email/templates";

const DEFAULT_SUPPORT_EMAIL = "spendbox@gmail.com";

async function getSupportEmail(): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key: "support_email" } }).catch(() => null);
  const v = row?.value?.trim();
  return v && v.includes("@") ? v : DEFAULT_SUPPORT_EMAIL;
}

/** Identify the signed-in sender from a doctor or patient session cookie. */
async function resolveSender(req: NextRequest): Promise<{ role: string; email: string | null; name: string | null }> {
  const docToken = req.cookies.get("doc_token")?.value;
  if (docToken) {
    const s = await prisma.doctorSession.findUnique({ where: { id: docToken } }).catch(() => null);
    if (s && s.expires_at > new Date()) {
      const p = await prisma.doctorProfile.findUnique({ where: { email: s.doctor_email } }).catch(() => null);
      return { role: "doctor", email: s.doctor_email, name: p ? [p.prefix, p.full_name].filter(Boolean).join(" ").trim() || null : null };
    }
  }
  const patToken = req.cookies.get("patient_token")?.value;
  if (patToken) {
    const s = await prisma.patientSession.findUnique({ where: { id: patToken } }).catch(() => null);
    if (s && s.expires_at > new Date()) {
      const p = await prisma.patientProfile.findUnique({ where: { email: s.patient_email } }).catch(() => null);
      return { role: "patient", email: s.patient_email, name: p?.name ?? null };
    }
  }
  return { role: "visitor", email: null, name: null };
}

const BodySchema = z.object({
  message: z.string().trim().min(3).max(4000),
  category: z.enum(["question", "feedback", "issue"]).default("question"),
  email: z.string().email().optional(), // fallback for visitors
});

/** POST /api/support/feedback — route a dashboard help/feedback message to support. */
export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Please enter a message." }, { status: 400 });

    const sender = await resolveSender(req);
    const senderEmail = sender.email ?? parsed.data.email ?? null;
    const support = await getSupportEmail();
    const categoryLabel = { question: "Question", feedback: "Feedback", issue: "Issue" }[parsed.data.category];

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: support,
      ...(senderEmail ? { reply_to: senderEmail } : {}),
      subject: `[${categoryLabel}] from ${sender.role} — ${sender.name || senderEmail || "Poveon dashboard"}`,
      html: supportFeedbackEmail({
        role: sender.role,
        senderEmail,
        senderName: sender.name,
        category: categoryLabel,
        message: parsed.data.message,
      }),
    });
    if (error) {
      console.error("[support/feedback] resend:", JSON.stringify(error));
      return NextResponse.json({ error: "Couldn't send your message. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[support/feedback]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
