export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getMemberByEmail } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** The dashboard renders a capped list — an unbounded fetch was the slow part. */
const MAX_REQUESTS = 200;

/**
 * GET /api/patient/bootstrap — everything the portal needs to render, at once.
 *
 * The dashboard used to open with three requests: `/patient/me`,
 * `/patient/profile` and `/consults/me`. Three serverless invocations, three
 * cold starts, and the same session lookup done three times before any of them
 * touched the data they were actually for.
 *
 * This is one invocation, one session lookup, and everything after it in
 * parallel. The individual endpoints stay — they are what the panels use when
 * something changes — but nothing needs them to paint the first screen.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const token = req.cookies.get("patient_token")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const session = await prisma.patientSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }
    const email = session.patient_email;

    const [requests, profile, member, settings] = await Promise.all([
      prisma.request.findMany({
        where: { patient_email: email },
        orderBy: { created_at: "desc" },
        take: MAX_REQUESTS,
        // Only the columns the dashboard renders — the row carries a lot of
        // lab-side workflow state the patient never sees.
        select: {
          id: true, code: true, patient_name: true, status: true, tests: true,
          schedule: true, diagnosis: true, test_image_url: true,
          result_link: true, result_note: true, result_file_urls: true,
          created_at: true, seen_at: true, completed_at: true,
          lab: { select: { id: true, name: true, address: true, whatsapp: true, phones: true } },
        },
      }),
      prisma.patientProfile.findUnique({ where: { email } }),
      getMemberByEmail(email).catch(() => null),
      getConsultSettings(),
    ]);

    const benefits = {
      price_naira: settings.price_naira,
      message_allowance: settings.message_allowance,
      lab_discount_percent: settings.lab_discount_percent,
      pharmacy_discount_percent: settings.pharmacy_discount_percent,
    };

    // Whatever we already know about them, so the enrolment form opens filled
    // in. Their most recent request covers anyone we only know via a referral.
    const last = profile?.name ? null : requests[0];
    const prefill = {
      full_name: profile?.name ?? last?.patient_name ?? "",
      phone: profile?.phone ?? "",
      date_of_birth: profile?.dob ?? "",
      sex: profile?.sex ?? "",
    };

    return NextResponse.json({
      success: true,
      patient_email: email,
      requests,
      profile,
      care: {
        status: member?.status ?? null,
        active: member?.status === "active",
        // pending_payment means they started and never paid — never "ended".
        lapsed: member?.status === "expired" || member?.status === "cancelled",
        benefits,
        prefill,
      },
    });
  } catch (err) {
    console.error("[patient/bootstrap]", err);
    return NextResponse.json({ error: "Could not load your dashboard." }, { status: 500 });
  }
}
