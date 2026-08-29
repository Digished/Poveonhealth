export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { doctorCredentialsSubmittedEmail } from "@/lib/email/templates";
import { appUrl, getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { getSkinAdminEmail } from "@/lib/skin-consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** GET /api/doc-login/credentials — what the doctor has filed, and where it stands. */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const [credential, profile] = await Promise.all([
      prisma.doctorCredential.findUnique({ where: { email } }),
      prisma.doctorProfile.findUnique({
        where: { email },
        select: { consult_approved: true, full_name: true, specialty: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      approved: !!profile?.consult_approved,
      credential: credential
        ? {
            mdcn_number: credential.mdcn_number,
            license_expires_at: credential.license_expires_at,
            license_doc_url: credential.license_doc_url,
            id_doc_url: credential.id_doc_url,
            cv_url: credential.cv_url,
            qualifications: credential.qualifications,
            specialty: credential.specialty ?? profile?.specialty ?? null,
            years_experience: credential.years_experience,
            note: credential.note,
            status: credential.status,
            submitted_at: credential.submitted_at,
            reviewed_at: credential.reviewed_at,
            review_note: credential.review_note,
          }
        : { status: "unsubmitted", specialty: profile?.specialty ?? null },
    });
  } catch (err) {
    console.error("[doc-login/credentials GET]", err);
    return NextResponse.json({ error: "Could not load your credentials." }, { status: 500 });
  }
}

const BodySchema = z.object({
  mdcn_number: z.string().trim().min(3, "Enter your MDCN registration number").max(40),
  license_expires_at: z.string().trim().min(1, "When does your practising licence expire?"),
  qualifications: z.string().trim().min(2, "List your qualifications").max(300),
  specialty: z.string().trim().max(120).optional().nullable(),
  years_experience: z.coerce.number().int().min(0).max(70).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  /** Set when the doctor is filing rather than just saving a draft. */
  submit: z.boolean().optional(),
});

/**
 * PATCH /api/doc-login/credentials — save, or file for review.
 *
 * What may change depends on where the application stands:
 *   • unsubmitted / rejected — everything
 *   • pending — nothing, it's with a reviewer
 *   • approved — only the licence expiry, so a renewed licence can be recorded
 *     without re-opening an approved identity
 *
 * Filing requires the practising licence to be attached; approval itself is
 * always a person's decision, never automatic.
 */
export async function PATCH(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
    }
    const d = parsed.data;

    const expiry = new Date(d.license_expires_at);
    if (Number.isNaN(expiry.getTime())) {
      return NextResponse.json({ error: "That licence expiry date isn't valid." }, { status: 400 });
    }

    const [existing, profile] = await Promise.all([
      prisma.doctorCredential.findUnique({ where: { email } }),
      prisma.doctorProfile.findUnique({ where: { email }, select: { consult_approved: true } }),
    ]);

    if (existing?.status === "pending") {
      return NextResponse.json(
        { error: "Your application is with the review team — you can't change it until they respond." },
        { status: 409 }
      );
    }

    // An approved doctor renews their licence; everything else is settled.
    if (profile?.consult_approved) {
      await prisma.doctorCredential.update({
        where: { email },
        data: { license_expires_at: expiry },
      });
      return NextResponse.json({ success: true, status: "approved", renewed: true });
    }

    if (d.submit && !existing?.license_doc_url) {
      return NextResponse.json(
        { error: "Attach your current practising licence before submitting." },
        { status: 400 }
      );
    }

    const fields = {
      mdcn_number: d.mdcn_number,
      license_expires_at: expiry,
      qualifications: d.qualifications,
      specialty: d.specialty || null,
      years_experience: d.years_experience ?? null,
      note: d.note || null,
      // Re-filing after a rejection puts it back in the queue.
      ...(d.submit ? { status: "pending", submitted_at: new Date(), review_note: null } : {}),
    };

    const credential = await prisma.doctorCredential.upsert({
      where: { email },
      create: { email, ...fields, status: d.submit ? "pending" : "unsubmitted" },
      update: fields,
    });

    if (d.submit) {
      void notifyAdmins(email, d.mdcn_number).catch((e) =>
        console.error("[doc-login/credentials] admin email:", e)
      );
    }

    return NextResponse.json({ success: true, status: credential.status });
  } catch (err) {
    console.error("[doc-login/credentials PATCH]", err);
    return NextResponse.json({ error: "Could not save your credentials." }, { status: 500 });
  }
}

/** Tell the admin team there's something in the review queue. */
async function notifyAdmins(doctorEmail: string, mdcn: string) {
  // Same address the skin-consult alerts use, so there's one inbox to watch.
  const to = await getSkinAdminEmail();
  if (!to) return;
  const profile = await prisma.doctorProfile.findUnique({
    where: { email: doctorEmail },
    select: { full_name: true, prefix: true },
  });
  await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Care-plan credentials filed: ${profile?.full_name ?? doctorEmail}`,
    html: doctorCredentialsSubmittedEmail({
      doctorName: profile?.full_name
        ? `${profile.prefix ? `${profile.prefix} ` : ""}${profile.full_name}`
        : doctorEmail,
      doctorEmail,
      mdcnNumber: mdcn,
      reviewUrl: `${appUrl()}/admin`,
    }),
  });
}
