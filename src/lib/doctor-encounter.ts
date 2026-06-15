// =============================================================================
// POVEON HEALTH - DOCTOR PER-ENCOUNTER CHARGING
// Pricing, shareable slug, Paystack split payments (80% doctor / 20% Poveon),
// patient-network upkeep, and notifications.
// =============================================================================

import OpenAI from "openai";
import type { NextRequest } from "next/server";
import type { DoctorProfile, Encounter } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { encounterDoctorEmail, encounterPatientEmail, encounterNoteEmail } from "@/lib/email/templates";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Poveon keeps 20%, the doctor takes 80%. This is also the subaccount's
// percentage_charge on Paystack (the share that returns to the main account).
export const POVEON_PERCENTAGE = 20;
export const DOCTOR_PERCENTAGE = 100 - POVEON_PERCENTAGE;

export type PlanType = "single" | "monthly" | "yearly";

// Floor for any fee a doctor sets (Naira).
export const MIN_CONSULT_FEE = 1000;
// Largest discount a coupon may grant.
export const MAX_COUPON_PERCENT = 90;

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
}

/** Apply a percent discount to an amount, never below the Paystack floor (₦100). */
export function applyDiscount(amountNaira: number, percentOff: number): number {
  const off = Math.max(0, Math.min(MAX_COUPON_PERCENT, percentOff));
  const discounted = Math.round(amountNaira * (1 - off / 100));
  return Math.max(100, discounted);
}

/** Split a charged amount into the doctor's and Poveon's shares (Naira). */
export function splitAmount(amountNaira: number): { doctor: number; poveon: number } {
  const poveon = Math.round((amountNaira * POVEON_PERCENTAGE) / 100);
  return { poveon, doctor: amountNaira - poveon };
}

/** The fee for a given plan, or null if the doctor hasn't priced that plan. */
export function priceForPlan(profile: DoctorProfile, plan: PlanType): number | null {
  const raw =
    plan === "single" ? profile.consultation_fee :
    plan === "monthly" ? profile.retainer_monthly :
    profile.retainer_yearly;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * A doctor can take encounters once they've priced a consult and saved a payout
 * bank. The Paystack subaccount is provisioned best-effort at save time and, if
 * that ever failed, lazily at charge time — so it isn't required for readiness.
 */
export function isEncounterReady(profile: DoctorProfile | null): boolean {
  return (
    !!profile &&
    priceForPlan(profile, "single") != null &&
    !!profile.account_number &&
    !!profile.bank_code
  );
}

// ── Shareable slug ───────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

const SLUG_SUFFIX = "abcdefghijkmnpqrstuvwxyz23456789";
function shortSuffix(len = 4): string {
  let s = "";
  for (let i = 0; i < len; i++) s += SLUG_SUFFIX[Math.floor(Math.random() * SLUG_SUFFIX.length)];
  return s;
}

/**
 * Generate a short, meaningful, unique slug for a doctor's shared link.
 * e.g. "Dr." + "Ada Obi" → "dr-ada-obi" (falls back to a suffixed variant).
 */
export async function generateEncounterSlug(prefix: string | null, fullName: string | null, email: string): Promise<string> {
  const titlePart = prefix ? slugify(prefix.replace(/\./g, "")) : "";
  const namePart = slugify(fullName || email.split("@")[0]);
  const base = [titlePart, namePart].filter(Boolean).join("-") || "doctor";

  for (const candidate of [base, `${base}-${shortSuffix(3)}`, `${base}-${shortSuffix(5)}`, `dr-${shortSuffix(6)}`]) {
    const existing = await prisma.doctorProfile.findFirst({
      where: { encounter_slug: candidate, NOT: { email } },
      select: { email: true },
    });
    if (!existing) return candidate;
  }
  return `dr-${shortSuffix(8)}`;
}

// ── Paystack split subaccount ────────────────────────────────────────────────

/**
 * Create (or update) a Paystack subaccount that routes DOCTOR_PERCENTAGE of every
 * charge to the doctor's bank, leaving POVEON_PERCENTAGE on the main account.
 * Returns the subaccount code, or null on failure.
 */
export async function upsertDoctorSubaccount(params: {
  existingCode: string | null;
  businessName: string;
  bankCode: string;
  accountNumber: string;
}): Promise<string | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[encounter] PAYSTACK_SECRET_KEY not set — cannot create subaccount");
    return null;
  }
  const body = {
    business_name: params.businessName,
    settlement_bank: params.bankCode,
    account_number: params.accountNumber,
    percentage_charge: POVEON_PERCENTAGE, // share retained by the main (Poveon) account
  };
  try {
    const url = params.existingCode
      ? `https://api.paystack.co/subaccount/${encodeURIComponent(params.existingCode)}`
      : "https://api.paystack.co/subaccount";
    const res = await fetch(url, {
      method: params.existingCode ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();
    if (!data.status || !data.data?.subaccount_code) {
      console.error("[encounter] subaccount upsert failed:", JSON.stringify(data));
      return params.existingCode; // keep the old one rather than wiping it
    }
    return data.data.subaccount_code as string;
  } catch (e) {
    console.error("[encounter] subaccount error:", e);
    return params.existingCode;
  }
}

/** Initialise a split Paystack transaction for an encounter; returns the hosted URL. */
export async function initEncounterPayment(params: {
  encounterId: string;
  code: string;
  email: string;
  amountNaira: number;
  subaccountCode?: string | null;
  doctorEmail: string;
  planType: PlanType;
}): Promise<{ authorizationUrl: string; reference: string } | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[encounter] PAYSTACK_SECRET_KEY not set — cannot charge");
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
        // When a subaccount exists the 80/20 split happens automatically here.
        // Without one we still charge and record the split for manual settlement.
        ...(params.subaccountCode ? { subaccount: params.subaccountCode, bearer: "account" } : {}),
        callback_url: `${appUrl()}/d/paid`,
        metadata: {
          purpose: "doctor_encounter",
          encounter_id: params.encounterId,
          code: params.code,
          doctor_email: params.doctorEmail,
          plan_type: params.planType,
        },
      }),
    });
    const data = await res.json();
    if (!data.status || !data.data?.authorization_url) {
      console.error("[encounter] paystack init failed:", JSON.stringify(data));
      return null;
    }
    return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
  } catch (e) {
    console.error("[encounter] paystack init error:", e);
    return null;
  }
}

/** Verify a Paystack transaction reference. */
export async function verifyEncounterPayment(
  reference: string
): Promise<{ success: boolean; amountNaira: number }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { success: false, amountNaira: 0 };
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json();
    if (!data.status || data.data?.status !== "success") return { success: false, amountNaira: 0 };
    return { success: true, amountNaira: Number(data.data.amount ?? 0) / 100 };
  } catch (e) {
    console.error("[encounter] paystack verify error:", e);
    return { success: false, amountNaira: 0 };
  }
}

// ── AI screening summary ─────────────────────────────────────────────────────

type ChatMessage = { role: string; content: string };

/** Concise clinical summary of the intake chat for the doctor (best-effort). */
export async function buildEncounterSummary(conversation: ChatMessage[], specialty: string | null): Promise<string | null> {
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
            `You summarise a patient intake chat for ${specialty ? `a ${specialty}` : "a doctor"}. Write a concise clinical summary (3-6 lines) covering the presenting complaint, onset/duration, symptoms, relevant history, and anything already tried. Use only facts the patient stated. Do NOT diagnose or recommend treatment. Plain prose, no headings.`,
        },
        { role: "user", content: transcript },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("[encounter] summary failed:", err);
    return null;
  }
}

// ── Patient network + retainership upkeep ────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Record/refresh the patient in the doctor's network after a verified payment.
 * Extends the retainership window for monthly/yearly plans.
 */
export async function recordPatientForDoctor(encounter: Encounter): Promise<void> {
  const doctorShare = Number(encounter.doctor_share ?? 0);
  const existing = await prisma.doctorPatient.findUnique({
    where: { doctor_email_patient_email: { doctor_email: encounter.doctor_email, patient_email: encounter.patient_email } },
  });

  let subType = existing?.subscription_type ?? "none";
  let subExpiry = existing?.subscription_expires_at ?? null;

  if (encounter.plan_type === "monthly" || encounter.plan_type === "yearly") {
    const months = encounter.plan_type === "yearly" ? 12 : 1;
    // Stack onto an existing, still-valid subscription; otherwise start from now.
    const from = subExpiry && subExpiry > new Date() ? subExpiry : new Date();
    subExpiry = addMonths(from, months);
    subType = encounter.plan_type;
  }

  if (existing) {
    await prisma.doctorPatient.update({
      where: { id: existing.id },
      data: {
        patient_name: encounter.patient_name,
        patient_phone: encounter.patient_phone,
        subscription_type: subType,
        subscription_expires_at: subExpiry,
        total_paid: Number(existing.total_paid) + doctorShare,
        encounter_count: existing.encounter_count + 1,
      },
    });
  } else {
    await prisma.doctorPatient.create({
      data: {
        doctor_email: encounter.doctor_email,
        patient_email: encounter.patient_email,
        patient_name: encounter.patient_name,
        patient_phone: encounter.patient_phone,
        subscription_type: subType,
        subscription_expires_at: subExpiry,
        total_paid: doctorShare,
        encounter_count: 1,
      },
    });
  }

  // Keep the global patient profile fresh for future auto-fill.
  await prisma.patientProfile.upsert({
    where: { email: encounter.patient_email },
    create: { email: encounter.patient_email, name: encounter.patient_name, phone: encounter.patient_phone },
    update: { name: encounter.patient_name, phone: encounter.patient_phone },
  }).catch(() => {});
}

/** How many patients a doctor manages — powers the public trust badge. */
export async function getDoctorPatientCount(doctorEmail: string): Promise<number> {
  return prisma.doctorPatient.count({ where: { doctor_email: doctorEmail } });
}

// ── Notifications ────────────────────────────────────────────────────────────

const PLAN_LABEL: Record<PlanType, string> = {
  single: "Single encounter",
  monthly: "Monthly retainership",
  yearly: "Yearly retainership",
};

/**
 * Notify the doctor (full request + Q&A + photos) and the patient (confirmation).
 * Call exactly once per encounter — after a verified payment.
 */
export async function notifyEncounter(encounter: Encounter, profile: DoctorProfile | null): Promise<void> {
  const conversation = Array.isArray(encounter.conversation)
    ? (encounter.conversation as unknown as ChatMessage[])
    : [];
  const doctorName = profile ? [profile.prefix, profile.full_name].filter(Boolean).join(" ").trim() : "";

  // Patient confirmation — await so a hard failure is visible
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: encounter.patient_email,
      subject: `Your request to ${doctorName || "your doctor"} — ${encounter.code}`,
      html: encounterPatientEmail({
        patientName: encounter.patient_name,
        doctorName: doctorName || "your doctor",
        code: encounter.code,
        planLabel: PLAN_LABEL[encounter.plan_type as PlanType] ?? "Encounter",
        amount: Number(encounter.amount_paid ?? 0),
      }),
    });
  } catch (e) {
    console.error("[encounter] patient email failed:", e);
  }

  // Doctor alert — fire-and-forget
  resend.emails
    .send({
      from: FROM_ADDRESS,
      to: encounter.doctor_email,
      subject: `🩺 New encounter — ${encounter.code} (${encounter.patient_name})`,
      html: encounterDoctorEmail({
        code: encounter.code,
        patientName: encounter.patient_name,
        patientEmail: encounter.patient_email,
        patientPhone: encounter.patient_phone,
        patientAge: encounter.patient_age,
        patientSex: encounter.patient_sex,
        planLabel: PLAN_LABEL[encounter.plan_type as PlanType] ?? "Encounter",
        amount: Number(encounter.amount_paid ?? 0),
        doctorShare: Number(encounter.doctor_share ?? 0),
        imageUrls: encounter.image_urls,
        conversation,
        aiSummary: encounter.ai_summary,
        dashboardUrl: `${appUrl()}/doc-login/dashboard`,
      }),
    })
    .then(({ error }) => { if (error) console.error("[encounter] doctor email:", JSON.stringify(error)); })
    .catch((e) => console.error("[encounter] doctor email error:", e));
}

/** Email a doctor's note to the patient. */
export async function sendEncounterNote(encounter: Encounter, doctorName: string, note: string): Promise<void> {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: encounter.patient_email,
    subject: `A note from ${doctorName || "your doctor"} — ${encounter.code}`,
    html: encounterNoteEmail({
      patientName: encounter.patient_name,
      doctorName: doctorName || "your doctor",
      code: encounter.code,
      note,
    }),
  });
}

// ── Doctor session helper ────────────────────────────────────────────────────

/** Resolve the logged-in doctor's email from the doc_token cookie, or null. */
export async function getDoctorEmailFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("doc_token")?.value;
  if (!token) return null;
  const session = await prisma.doctorSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;
  return session.doctor_email;
}
