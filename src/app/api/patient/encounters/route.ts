import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/patient/encounters — the patient's paid encounters with doctors,
 * enriched with the doctor's name/specialty and any active retainership.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("patient_token")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const session = await prisma.patientSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }
    const email = session.patient_email;

    let encounters: Awaited<ReturnType<typeof prisma.encounter.findMany>> = [];
    let subs: Awaited<ReturnType<typeof prisma.doctorPatient.findMany>> = [];
    try {
      [encounters, subs] = await Promise.all([
        prisma.encounter.findMany({
          where: { patient_email: email, status: { not: "awaiting_payment" } },
          orderBy: { created_at: "desc" },
          take: 200,
        }),
        prisma.doctorPatient.findMany({ where: { patient_email: email } }),
      ]);
    } catch {
      // Charging tables may not exist yet on this DB — treat as no encounters.
      return NextResponse.json({ success: true, encounters: [], subscriptions: [] });
    }

    // Resolve doctor display info in one query
    const doctorEmails = Array.from(new Set([...encounters.map((e) => e.doctor_email), ...subs.map((s) => s.doctor_email)]));
    const profiles = doctorEmails.length
      ? await prisma.doctorProfile.findMany({
          where: { email: { in: doctorEmails } },
          select: { email: true, prefix: true, full_name: true, specialty: true, avatar_url: true },
        })
      : [];
    const byEmail = new Map(profiles.map((p) => [p.email, p]));
    const nameOf = (e: string) => {
      const p = byEmail.get(e);
      return p ? [p.prefix, p.full_name].filter(Boolean).join(" ").trim() || "Your doctor" : "Your doctor";
    };

    const now = new Date();

    return NextResponse.json({
      success: true,
      encounters: encounters.map((e) => ({
        id: e.id,
        code: e.code,
        doctor_name: nameOf(e.doctor_email),
        doctor_specialty: byEmail.get(e.doctor_email)?.specialty ?? null,
        doctor_avatar: byEmail.get(e.doctor_email)?.avatar_url ?? null,
        plan_type: e.plan_type,
        status: e.status,
        doctor_note: e.doctor_note,
        amount_paid: Number(e.amount_paid ?? 0),
        image_urls: e.image_urls,
        created_at: e.created_at,
        responded_at: e.responded_at,
      })),
      subscriptions: subs
        .filter((s) => s.subscription_type !== "none" && s.subscription_expires_at)
        .map((s) => ({
          doctor_name: nameOf(s.doctor_email),
          doctor_specialty: byEmail.get(s.doctor_email)?.specialty ?? null,
          subscription_type: s.subscription_type,
          expires_at: s.subscription_expires_at,
          active: !!s.subscription_expires_at && s.subscription_expires_at > now,
        })),
    });
  } catch (err) {
    console.error("[patient/encounters]", err);
    return NextResponse.json({ error: "Failed to load encounters." }, { status: 500 });
  }
}
