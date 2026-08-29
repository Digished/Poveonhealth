export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { carePlanScheduleEmail } from "@/lib/email/templates";
import { appUrl, getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { describePrescription } from "@/lib/prescription-parse";
import { medLiveWhere } from "@/lib/medication-status";
import { CADENCE_LABEL } from "@/lib/treatment-plan";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({ message: z.string().trim().max(1200).optional().nullable() });

const formatDue = (d: Date | null) =>
  d ? `by ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : null;

/**
 * POST /api/doc-login/consults/patients/[id]/notify — tell the member what
 * their doctor has set up.
 *
 * Scheduling a test or a medication sends nothing on its own. The doctor works
 * through the whole schedule, then sends one message covering all of it, with
 * a note of their own if they want one.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({ where: { id: params.id } });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid note." }, { status: 400 });

    const [profile, testOrders, prescriptions, plan] = await Promise.all([
      prisma.doctorProfile.findUnique({
        where: { email },
        select: { full_name: true, prefix: true },
      }),
      prisma.consultTestOrder.findMany({
        where: { patient_id: patient.id, status: "scheduled" },
        orderBy: { due_date: "asc" },
        take: 20,
      }),
      prisma.consultPrescription.findMany({
        where: { patient_id: patient.id, ...medLiveWhere },
        orderBy: { created_at: "desc" },
        take: 20,
      }),
      prisma.consultTreatmentPlan.findFirst({
        where: { patient_id: patient.id, status: "active" },
        orderBy: { created_at: "desc" },
        include: { items: { orderBy: { position: "asc" } } },
      }),
    ]);

    const note = parsed.data.message?.trim() || null;
    if (!testOrders.length && !prescriptions.length && !plan && !note) {
      return NextResponse.json(
        { error: "There's nothing scheduled to tell them about yet." },
        { status: 400 }
      );
    }

    const doctorName = profile?.full_name
      ? `${profile.prefix ? `${profile.prefix} ` : ""}${profile.full_name}`
      : "Your doctor";

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: patient.email,
      subject: "Your doctor updated your care plan",
      html: carePlanScheduleEmail({
        memberName: patient.full_name,
        doctorName,
        tests: testOrders.map((t) => ({ summary: t.tests, due: formatDue(t.due_date) })),
        medications: prescriptions.map((p) =>
          // The parser's own rendering, so the member reads the same line the
          // doctor's schedule shows rather than a raw abbreviation.
          describePrescription({
            raw_text: p.raw_text ?? "",
            medication: p.medication,
            form: p.form,
            dosage: p.dosage,
            frequency: p.frequency,
            doses_per_day: null,
            duration_days: p.duration_days,
            duration_text: p.duration_days ? `${p.duration_days} days` : null,
            route: null,
            instructions: p.instructions,
            unparsed: [],
            confidence: 1,
          })
        ),
        planItems:
          plan?.items.map((i) => `${i.label} — ${CADENCE_LABEL[i.cadence] ?? i.cadence}`) ?? [],
        planNote: plan?.note ?? null,
        message: note,
        dashboardUrl: `${appUrl()}/dashboard?tab=care`,
      }),
    });

    if (plan) {
      await prisma.consultTreatmentPlan.update({
        where: { id: plan.id },
        data: { notified_at: new Date() },
      });
    }

    return NextResponse.json({
      success: true,
      sent: {
        tests: testOrders.length,
        medications: prescriptions.length,
        plan_items: plan?.items.length ?? 0,
      },
    });
  } catch (err) {
    console.error("[doc-login/consults/notify]", err);
    return NextResponse.json({ error: "Could not send that update." }, { status: 500 });
  }
}
