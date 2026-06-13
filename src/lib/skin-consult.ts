// =============================================================================
// POVEON HEALTH - SKIN CONSULT SETTINGS, PAYMENT & NOTIFICATIONS
// =============================================================================

import OpenAI from "openai";
import type { SkinConsult } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { skinConsultPatient, skinConsultAdmin } from "@/lib/email/templates";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const SKIN_PRICE_KEY = "skin_consult_price"; // Naira; "0" = free, no payment required
export const SKIN_ADMIN_EMAIL_KEY = "skin_consult_admin_email";
export const SKIN_PRICE_DEFAULT = "10000";
export const SKIN_ADMIN_EMAIL_DEFAULT = "spendbox@gmail.com";

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
}

/** Configured consultation price in Naira (0 means free / no charge). */
export async function getSkinPrice(): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SKIN_PRICE_KEY } });
  const value = row?.value ?? SKIN_PRICE_DEFAULT;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : Number(SKIN_PRICE_DEFAULT);
}

/** Where new-consult alerts are sent. */
export async function getSkinAdminEmail(): Promise<string> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SKIN_ADMIN_EMAIL_KEY } });
  const value = row?.value?.trim();
  return value || process.env.ADMIN_ALERT_EMAIL || SKIN_ADMIN_EMAIL_DEFAULT;
}

type ChatMessage = { role: string; content: string };

/** Generate a concise clinical summary for the reviewing dermatologist (best-effort). */
export async function buildSkinSummary(conversation: ChatMessage[]): Promise<string | null> {
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
    console.error("[skin] summary failed:", err);
    return null;
  }
}

/**
 * Notify the patient (confirmation) and admin (full conversation + photos).
 * Call exactly once per consult — after a free submission or a verified payment.
 */
export async function notifySkinConsult(consult: SkinConsult): Promise<void> {
  const conversation = Array.isArray(consult.conversation)
    ? (consult.conversation as unknown as ChatMessage[])
    : [];

  // Patient confirmation — await so a hard failure is visible
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: consult.patient_email,
      subject: `Your skin consultation — ${consult.code}`,
      html: skinConsultPatient({ patientName: consult.patient_name, code: consult.code }),
    });
  } catch (e) {
    console.error("[skin] patient email failed:", e);
  }

  // Admin alert — fire-and-forget
  const adminEmail = await getSkinAdminEmail();
  resend.emails
    .send({
      from: FROM_ADDRESS,
      to: adminEmail,
      subject: `🩺 New skin consultation — ${consult.code} (${consult.patient_name})`,
      html: skinConsultAdmin({
        code: consult.code,
        patientName: consult.patient_name,
        patientEmail: consult.patient_email,
        patientWhatsapp: consult.patient_whatsapp,
        patientAge: consult.patient_age,
        patientSex: consult.patient_sex,
        imageUrls: consult.image_urls,
        conversation,
        aiSummary: consult.ai_summary,
        dashboardUrl: `${appUrl()}/admin`,
      }),
    })
    .then(({ error }) => { if (error) console.error("[skin] admin email:", JSON.stringify(error)); })
    .catch((e) => console.error("[skin] admin email error:", e));
}

/** Initialise a Paystack transaction for a consult; returns the hosted payment URL. */
export async function initSkinPayment(params: {
  consultId: string;
  code: string;
  email: string;
  amountNaira: number;
}): Promise<{ authorizationUrl: string; reference: string } | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[skin] PAYSTACK_SECRET_KEY not set — cannot charge");
    return null;
  }
  try {
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amountNaira * 100), // kobo
        currency: "NGN",
        callback_url: `${appUrl()}/skin/paid`,
        metadata: {
          purpose: "skin_consult",
          consult_id: params.consultId,
          code: params.code,
        },
      }),
    });
    const data = await res.json();
    if (!data.status || !data.data?.authorization_url) {
      console.error("[skin] paystack init failed:", JSON.stringify(data));
      return null;
    }
    return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
  } catch (e) {
    console.error("[skin] paystack init error:", e);
    return null;
  }
}

/** Verify a Paystack transaction reference. */
export async function verifySkinPayment(
  reference: string
): Promise<{ success: boolean; amountNaira: number; consultId?: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { success: false, amountNaira: 0 };
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json();
    if (!data.status || data.data?.status !== "success") {
      return { success: false, amountNaira: 0 };
    }
    return {
      success: true,
      amountNaira: Number(data.data.amount ?? 0) / 100,
      consultId: data.data.metadata?.consult_id,
    };
  } catch (e) {
    console.error("[skin] paystack verify error:", e);
    return { success: false, amountNaira: 0 };
  }
}
