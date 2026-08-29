export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { carePlanWelcomeEmail, carePlanDoctorNewMemberEmail } from "@/lib/email/templates";
import {
  activateMembership,
  appUrl,
  activeMemberWhere,
  CONDITION_LABELS,
  getConsultSettings,
  naira,
  verifyConsultPayment,
} from "@/lib/consult";

/**
 * POST /api/consults/verify — confirm a Paystack reference and switch the
 * membership on. The care code is issued here, never before.
 *
 * Safe to call more than once for the same reference (Paystack can redirect
 * twice, and the member may refresh the return page).
 */
export async function POST(req: NextRequest) {
  try {
    const { reference } = await req.json();
    if (!reference || typeof reference !== "string") {
      return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
    }

    const payment = await verifyConsultPayment(reference);
    if (!payment.success) {
      return NextResponse.json({ error: "That payment has not gone through." }, { status: 402 });
    }

    const patientId =
      payment.patientId ??
      (await prisma.consultPatient.findFirst({ where: { paystack_ref: reference }, select: { id: true } }))?.id;
    if (!patientId) {
      return NextResponse.json({ error: "We could not match that payment to a sign-up." }, { status: 404 });
    }

    const result = await activateMembership({
      patientId,
      amountNaira: payment.amountNaira,
      reference,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "We could not activate that membership." }, { status: 404 });
    }

    const patient = await prisma.consultPatient.findUnique({ where: { id: patientId } });
    if (!patient) return NextResponse.json({ error: "Membership not found." }, { status: 404 });

    if (!result.alreadyActive) {
      // Fire-and-forget — a slow mail server must not hold up the return page.
      void sendActivationEmails(patient.id).catch((e) => console.error("[consults/verify] emails:", e));
    }

    return NextResponse.json({
      success: true,
      member: {
        code: patient.code,
        full_name: patient.full_name,
        expires_at: patient.expires_at,
        doctor_assigned: !!patient.doctor_email,
      },
    });
  } catch (err) {
    console.error("[consults/verify]", err);
    return NextResponse.json({ error: "Could not confirm that payment." }, { status: 500 });
  }
}

/** Welcome the member, and tell the assigned doctor they have someone new. */
async function sendActivationEmails(patientId: string) {
  const patient = await prisma.consultPatient.findUnique({ where: { id: patientId } });
  if (!patient?.code) return;
  const settings = await getConsultSettings();

  const doctor = patient.doctor_email
    ? await prisma.doctorProfile.findUnique({
        where: { email: patient.doctor_email },
        select: { full_name: true, prefix: true },
      })
    : null;
  const doctorName = doctor?.full_name
    ? `${doctor.prefix ? `${doctor.prefix} ` : ""}${doctor.full_name}`
    : null;

  const expiresOn = patient.expires_at
    ? patient.expires_at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: patient.email,
    subject: `Your Poveon Care Plan is active — code ${patient.code}`,
    html: carePlanWelcomeEmail({
      memberName: patient.full_name,
      code: patient.code,
      doctorName,
      messageAllowance: patient.message_allowance,
      expiresOn,
      labDiscount: settings.lab_discount_percent,
      pharmacyDiscount: settings.pharmacy_discount_percent,
      dashboardUrl: `${appUrl()}/dashboard?tab=care`,
    }),
  });

  if (!patient.doctor_email) return;

  const poolSize = await prisma.consultPatient.count({
    where: { doctor_email: patient.doctor_email, ...activeMemberWhere() },
  });

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: patient.doctor_email,
    subject: `New care-plan member: ${patient.full_name}`,
    html: carePlanDoctorNewMemberEmail({
      doctorName: doctorName ?? "Doctor",
      memberName: patient.full_name,
      conditions: patient.conditions.map((c) => CONDITION_LABELS[c] ?? c),
      poolSize,
      earningPerMember: naira(settings.doctor_share_naira),
      dashboardUrl: `${appUrl()}/doc-login/dashboard?tab=consults`,
    }),
  });
}
