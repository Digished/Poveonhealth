export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromRequest } from "@/lib/doctor-encounter";

/**
 * GET /api/doc-login/encounters — the doctor's paid encounters, patient network
 * (with subscription status), and revenue summary (the doctor's 80% share).
 */
export async function GET(req: NextRequest) {
  const email = await getDoctorEmailFromRequest(req);
  if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [encounters, patients] = await Promise.all([
    prisma.encounter.findMany({
      where: { doctor_email: email, status: { not: "awaiting_payment" } },
      orderBy: { created_at: "desc" },
      take: 500,
    }),
    prisma.doctorPatient.findMany({
      where: { doctor_email: email },
      orderBy: { updated_at: "desc" },
      take: 1000,
    }),
  ]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalRevenue = 0; // doctor's 80% share, all time
  let monthRevenue = 0; // this calendar month
  for (const e of encounters) {
    const share = Number(e.doctor_share ?? 0);
    totalRevenue += share;
    if (e.paid_at && e.paid_at >= monthStart) monthRevenue += share;
  }

  const activeSubscribers = patients.filter(
    (p) => p.subscription_type !== "none" && p.subscription_expires_at && p.subscription_expires_at > now
  ).length;

  return NextResponse.json({
    success: true,
    revenue: {
      total: Math.round(totalRevenue),
      this_month: Math.round(monthRevenue),
      encounter_count: encounters.length,
      patient_count: patients.length,
      active_subscribers: activeSubscribers,
    },
    encounters: encounters.map((e) => ({
      id: e.id,
      code: e.code,
      patient_name: e.patient_name,
      patient_email: e.patient_email,
      patient_phone: e.patient_phone,
      patient_age: e.patient_age,
      patient_sex: e.patient_sex,
      image_urls: e.image_urls,
      conversation: e.conversation,
      ai_summary: e.ai_summary,
      plan_type: e.plan_type,
      status: e.status,
      doctor_note: e.doctor_note,
      amount_paid: Number(e.amount_paid ?? 0),
      doctor_share: Number(e.doctor_share ?? 0),
      paid_at: e.paid_at,
      created_at: e.created_at,
    })),
    patients: patients.map((p) => ({
      id: p.id,
      patient_name: p.patient_name,
      patient_email: p.patient_email,
      patient_phone: p.patient_phone,
      subscription_type: p.subscription_type,
      subscription_expires_at: p.subscription_expires_at,
      active: p.subscription_type !== "none" && !!p.subscription_expires_at && p.subscription_expires_at > now,
      total_paid: Number(p.total_paid ?? 0),
      encounter_count: p.encounter_count,
      created_at: p.created_at,
    })),
  });
}
