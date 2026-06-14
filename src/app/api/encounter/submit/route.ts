export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import {
  buildEncounterSummary,
  initEncounterPayment,
  isEncounterReady,
  priceForPlan,
  splitAmount,
  type PlanType,
} from "@/lib/doctor-encounter";

const MessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().max(4000),
});

const BodySchema = z.object({
  slug: z.string().trim().min(1),
  plan_type: z.enum(["single", "monthly", "yearly"]),
  patient_name: z.string().trim().min(2).max(120),
  patient_email: z.string().email(),
  patient_phone: z.string().trim().min(7).max(25),
  patient_age: z.coerce.number().int().min(0).max(120).optional().nullable(),
  patient_sex: z.enum(["male", "female", "other"]).optional().nullable(),
  image_urls: z.array(z.string().url()).max(5).default([]),
  conversation: z.array(MessageSchema).max(40).default([]),
});

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

    const profile = await prisma.doctorProfile.findUnique({ where: { encounter_slug: data.slug.toLowerCase() } });
    if (!profile) return NextResponse.json({ error: "Doctor not found." }, { status: 404 });
    if (!isEncounterReady(profile)) {
      return NextResponse.json({ error: "This doctor isn't accepting requests yet." }, { status: 409 });
    }

    const plan = data.plan_type as PlanType;
    const price = priceForPlan(profile, plan);
    if (!price) {
      return NextResponse.json({ error: "That plan isn't available from this doctor." }, { status: 409 });
    }

    const code = await generateUniqueCode("ENC", async (candidate) => {
      const existing = await prisma.encounter.findUnique({ where: { code: candidate }, select: { id: true } });
      return !!existing;
    });

    const aiSummary = await buildEncounterSummary(data.conversation, profile.specialty);
    const { doctor, poveon } = splitAmount(price);

    const encounter = await prisma.encounter.create({
      data: {
        code,
        doctor_email: profile.email,
        patient_name: data.patient_name,
        patient_email: data.patient_email.trim().toLowerCase(),
        patient_phone: data.patient_phone.trim(),
        patient_age: data.patient_age ?? null,
        patient_sex: data.patient_sex ?? null,
        image_urls: data.image_urls,
        conversation: data.conversation,
        ai_summary: aiSummary,
        plan_type: plan,
        status: "awaiting_payment",
        amount_paid: price,
        doctor_share: doctor,
        poveon_share: poveon,
      },
    });

    const payment = await initEncounterPayment({
      encounterId: encounter.id,
      code: encounter.code,
      email: encounter.patient_email,
      amountNaira: price,
      subaccountCode: profile.paystack_subaccount_code!,
      doctorEmail: profile.email,
      planType: plan,
    });
    if (!payment) {
      await prisma.encounter.delete({ where: { id: encounter.id } }).catch(() => {});
      return NextResponse.json(
        { error: "Could not start payment. Please try again in a moment." },
        { status: 502 }
      );
    }

    await prisma.encounter.update({
      where: { id: encounter.id },
      data: { payment_reference: payment.reference },
    });

    return NextResponse.json({
      success: true,
      requiresPayment: true,
      authorizationUrl: payment.authorizationUrl,
      reference: payment.reference,
    });
  } catch (err) {
    console.error("[encounter/submit]", err);
    return NextResponse.json({ error: "Failed to submit your request. Please try again." }, { status: 500 });
  }
}
