export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  activeMemberWhere,
  getConsultSettings,
  getDoctorConsultWallet,
  getDoctorEmailFromConsultRequest,
} from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/doc-login/consults — the doctor's care-plan overview.
 *
 * Deliberately counts rather than lists: a doctor may be carrying a couple of
 * thousand members, and the list is paged separately.
 */
export async function GET(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const settings = await getConsultSettings();

    const [wallet, profile, unread, awaitingAssessment, recentReleases] = await Promise.all([
      getDoctorConsultWallet(email),
      prisma.doctorProfile.findUnique({
        where: { email },
        select: {
          consult_accepting: true, consult_patient_cap: true, full_name: true,
          consult_approved: true,
        },
      }),
      // Members waiting on a reply.
      prisma.consultMessage.count({
        where: { sender: "patient", read_at: null, patient: { doctor_email: email } },
      }),
      // Members the doctor has never written to — the first-assessment queue.
      prisma.consultPatient.count({
        where: { doctor_email: email, ...activeMemberWhere(), messages: { none: { sender: "doctor" } } },
      }),
      prisma.consultEarningRelease.findMany({
        where: { doctor_email: email },
        orderBy: { created_at: "desc" },
        take: 60,
        select: { amount_naira: true, period: true, created_at: true },
      }),
    ]);

    // Roll the instalments up per month for the payout history.
    const byPeriod = new Map<string, { period: string; amount: number; at: Date }>();
    for (const r of recentReleases) {
      const row = byPeriod.get(r.period);
      if (row) row.amount += Number(r.amount_naira);
      else byPeriod.set(r.period, { period: r.period, amount: Number(r.amount_naira), at: r.created_at });
    }

    return NextResponse.json({
      success: true,
      // Cleared by an admin to manage care-plan members — see DoctorCredential.
      approved: !!profile?.consult_approved,
      wallet,
      unread_messages: unread,
      awaiting_assessment: awaitingAssessment,
      preferences: {
        accepting: profile?.consult_accepting ?? true,
        patient_cap: profile?.consult_patient_cap ?? null,
        default_cap: settings.default_doctor_cap,
        effective_cap: profile?.consult_patient_cap ?? settings.default_doctor_cap,
      },
      payouts: Array.from(byPeriod.values())
        .sort((a, b) => (a.period < b.period ? 1 : -1))
        .map((p) => ({ period: p.period, amount: Math.round(p.amount), released_at: p.at })),
    });
  } catch (err) {
    console.error("[doc-login/consults]", err);
    return NextResponse.json({ error: "Could not load your care plan." }, { status: 500 });
  }
}
