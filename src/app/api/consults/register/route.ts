export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CONSULT_CONDITIONS,
  generateMemberCode,
  getConsultSettings,
  initConsultPayment,
} from "@/lib/consult";

const BodySchema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name").max(120),
  email: z.string().trim().email("Please enter a valid email address"),
  phone: z.string().trim().min(7).max(20),
  sex: z.enum(["male", "female"]).optional().nullable(),
  date_of_birth: z.string().trim().optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  conditions: z.array(z.enum(CONSULT_CONDITIONS)).min(1, "Select at least one condition"),
  goal: z.string().trim().min(3, "Tell us your goal for the year").max(500),
  goal_metric: z.string().trim().max(300).optional().nullable(),
});

/**
 * POST /api/consults/register — start a care-plan membership.
 *
 * Creates (or refreshes) a pending member record and hands back a Paystack
 * checkout URL. Nothing is activated until the payment is verified.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
    }
    const d = parsed.data;
    const email = d.email.toLowerCase();
    const settings = await getConsultSettings();

    const existing = await prisma.consultPatient.findUnique({ where: { email } });
    if (existing?.status === "active") {
      return NextResponse.json(
        { error: "This email already has an active care plan. Sign in to see your code." },
        { status: 409 }
      );
    }

    const dob = d.date_of_birth ? new Date(d.date_of_birth) : null;
    const fields = {
      full_name: d.full_name,
      phone: d.phone,
      sex: d.sex ?? null,
      date_of_birth: dob && !Number.isNaN(dob.getTime()) ? dob : null,
      state: d.state || null,
      city: d.city || null,
      conditions: d.conditions,
      goal: d.goal,
      goal_metric: d.goal_metric || null,
      message_allowance: settings.message_allowance,
    };

    // Someone who started and abandoned a sign-up keeps their row (and code) —
    // re-registering just refreshes the details and issues a new checkout.
    const patient = existing
      ? await prisma.consultPatient.update({ where: { id: existing.id }, data: fields })
      : await prisma.consultPatient.create({
          data: { ...fields, email, code: await generateMemberCode(), status: "pending_payment" },
        });

    const payment = await initConsultPayment({
      patientId: patient.id,
      code: patient.code,
      email,
      amountNaira: settings.price_naira,
    });
    if (!payment) {
      return NextResponse.json(
        { error: "Could not start the payment. Please try again in a moment." },
        { status: 502 }
      );
    }

    await prisma.consultPatient.update({
      where: { id: patient.id },
      data: { paystack_ref: payment.reference },
    });

    return NextResponse.json({
      success: true,
      patient_id: patient.id,
      amount_naira: settings.price_naira,
      authorization_url: payment.authorizationUrl,
    });
  } catch (err) {
    console.error("[consults/register]", err);
    return NextResponse.json({ error: "Could not complete your registration." }, { status: 500 });
  }
}
