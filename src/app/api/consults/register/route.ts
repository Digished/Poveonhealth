export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CONSULT_CONDITIONS,
  getConsultSettings,
  getPatientEmailFromRequest,
  initConsultPayment,
} from "@/lib/consult";

const BodySchema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name").max(120),
  phone: z.string().trim().min(7, "Please enter your phone number").max(20),
  sex: z.enum(["male", "female"]).optional().nullable(),
  date_of_birth: z.string().trim().optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  conditions: z.array(z.enum(CONSULT_CONDITIONS)).min(1, "Select at least one condition"),
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree to the terms to continue" }) }),
});

/**
 * POST /api/consults/register — enrol the signed-in patient on the care plan.
 *
 * Saves (or refreshes) their enrolment and hands back a Paystack checkout URL.
 * Nothing is activated and no care code is issued until the payment is verified.
 */
export async function POST(req: NextRequest) {
  try {
    const email = await getPatientEmailFromRequest(req);
    if (!email) {
      return NextResponse.json({ error: "Please sign in to join the care plan." }, { status: 401 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
    }
    const d = parsed.data;
    const settings = await getConsultSettings();

    const existing = await prisma.consultPatient.findUnique({ where: { email } });
    if (existing?.status === "active") {
      return NextResponse.json(
        { error: "You already have an active care plan." },
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
      consent_at: new Date(),
      message_allowance: settings.message_allowance,
    };

    // An abandoned enrolment keeps its row — re-submitting refreshes the
    // details and issues a fresh checkout. Still no code until they pay.
    const patient = existing
      ? await prisma.consultPatient.update({ where: { id: existing.id }, data: fields })
      : await prisma.consultPatient.create({
          data: { ...fields, email, status: "pending_payment" },
        });

    // Keep the portal profile in step, so the next lab request is pre-filled.
    await prisma.patientProfile.upsert({
      where: { email },
      create: {
        email,
        name: d.full_name,
        phone: d.phone,
        dob: fields.date_of_birth ? fields.date_of_birth.toISOString().slice(0, 10) : null,
        sex: d.sex ?? null,
      },
      update: {
        name: d.full_name,
        phone: d.phone,
        ...(fields.date_of_birth ? { dob: fields.date_of_birth.toISOString().slice(0, 10) } : {}),
        ...(d.sex ? { sex: d.sex } : {}),
      },
    }).catch((e) => console.error("[consults/register] profile sync:", e));

    const payment = await initConsultPayment({
      patientId: patient.id,
      code: patient.code ?? patient.id,
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
    return NextResponse.json({ error: "Could not complete your enrolment." }, { status: 500 });
  }
}
