export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { carePlanWelcomeEmail, carePlanDoctorNewMemberEmail } from "@/lib/email/templates";
import {
  activateMembership,
  activeMemberWhere,
  appUrl,
  CONDITION_LABELS,
  generateMemberCode,
  getConsultSettings,
  naira,
} from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BodySchema = z.object({
  // The email is the identity. Everything else is optional — we fill the gaps
  // from whatever we already hold for that address.
  email: z.string().trim().email("Enter a valid email address"),
  full_name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  conditions: z.array(z.string()).optional(),
  amount_naira: z.coerce.number().min(0).max(10_000_000).optional(),
});

/**
 * POST /api/admin/consults/activate — switch a member on by hand.
 *
 * For someone who paid by transfer, cash, or as part of a group. It runs the
 * same activation as a card payment, so the member gets a real care code, a
 * doctor is assigned by the usual fair rotation, and that doctor's entitlement
 * opens exactly as it would otherwise.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    const d = parsed.data;
    const settings = await getConsultSettings();
    const email = d.email.toLowerCase();

    const [existing, profile, lastRequest] = await Promise.all([
      prisma.consultPatient.findUnique({ where: { email } }),
      prisma.patientProfile.findUnique({
        where: { email },
        select: { name: true, phone: true, dob: true, sex: true },
      }),
      // Anyone who reached us through a lab request already has a name on file.
      prisma.request.findFirst({
        where: { patient_email: email },
        orderBy: { created_at: "desc" },
        select: { patient_name: true, patient_phone: true, dob: true, sex: true },
      }),
    ]);

    // Fall back through everything we know before asking anyone to type it.
    const fullName =
      d.full_name?.trim() ||
      existing?.full_name ||
      profile?.name ||
      lastRequest?.patient_name ||
      email.split("@")[0];
    const phone = d.phone || existing?.phone || profile?.phone || lastRequest?.patient_phone || null;

    let patientId: string;
    if (existing) {
      patientId = existing.id;
      // Top up anything still blank, without overwriting what they entered.
      await prisma.consultPatient.update({
        where: { id: existing.id },
        data: {
          ...(existing.full_name ? {} : { full_name: fullName }),
          ...(existing.phone ? {} : { phone }),
          ...(existing.conditions.length ? {} : { conditions: d.conditions?.length ? d.conditions : ["hypertension"] }),
        },
      });
    } else {
      const created = await prisma.consultPatient.create({
        data: {
          email,
          full_name: fullName,
          phone,
          sex: profile?.sex ?? lastRequest?.sex ?? null,
          conditions: d.conditions?.length ? d.conditions : ["hypertension"],
          status: "pending_payment",
          // Activating by hand is itself the record of consent taken offline;
          // the admin is asserting it.
          consent_at: new Date(),
          message_allowance: settings.message_allowance,
        },
      });
      patientId = created.id;
      // Keep the portal profile in step so they can sign in and see it.
      await prisma.patientProfile
        .upsert({
          where: { email },
          create: { email, name: fullName, phone },
          update: { ...(profile?.name ? {} : { name: fullName }), ...(profile?.phone || !phone ? {} : { phone }) },
        })
        .catch(() => {});
    }

    const patient = await prisma.consultPatient.findUnique({ where: { id: patientId } });
    if (!patient) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    if (patient.status === "active") {
      return NextResponse.json({ error: "That member is already active." }, { status: 409 });
    }

    // A code is normally minted at activation; make sure one exists either way.
    if (!patient.code) {
      await prisma.consultPatient.update({
        where: { id: patient.id },
        data: { code: await generateMemberCode() },
      });
    }

    const result = await activateMembership({
      patientId: patient.id,
      amountNaira: d.amount_naira ?? settings.price_naira,
      reference: `manual:${admin.email ?? admin.id}:${Date.now()}`,
      activatedBy: admin.email ?? undefined,
    });
    if (!result.ok) return NextResponse.json({ error: "Could not activate that member." }, { status: 500 });

    void sendActivationEmails(patient.id).catch((e) =>
      console.error("[admin/consults/activate] emails:", e)
    );

    const activated = await prisma.consultPatient.findUnique({
      where: { id: patient.id },
      select: { code: true, doctor_email: true, expires_at: true, full_name: true },
    });

    return NextResponse.json({ success: true, member: activated });
  } catch (err) {
    console.error("[admin/consults/activate]", err);
    return NextResponse.json({ error: "Could not activate that member." }, { status: 500 });
  }
}

/** Identical to the paid path — the member shouldn't be able to tell. */
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

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: patient.email,
    subject: `Your Poveon Care Plan is active — code ${patient.code}`,
    html: carePlanWelcomeEmail({
      memberName: patient.full_name,
      code: patient.code,
      doctorName,
      messageAllowance: patient.message_allowance,
      expiresOn: patient.expires_at
        ? patient.expires_at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        : "",
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
