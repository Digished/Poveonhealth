export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { carePlanOrderEmail } from "@/lib/email/templates";
import { appUrl, getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const RECURRENCES = ["once", "monthly", "quarterly", "biannual", "annual"] as const;

const PrescriptionSchema = z.object({
  kind: z.literal("prescription"),
  medication: z.string().trim().min(2, "Name the medication").max(160),
  dosage: z.string().trim().max(80).optional().nullable(),
  frequency: z.string().trim().max(80).optional().nullable(),
  duration_days: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  instructions: z.string().trim().max(600).optional().nullable(),
  start_date: z.string().trim().optional().nullable(),
});

const TestOrderSchema = z.object({
  kind: z.literal("test"),
  tests: z.string().trim().min(2, "Name the test(s)").max(600),
  reason: z.string().trim().max(400).optional().nullable(),
  due_date: z.string().trim().optional().nullable(),
  recurrence: z.enum(RECURRENCES).optional(),
});

const BodySchema = z.discriminatedUnion("kind", [PrescriptionSchema, TestOrderSchema]);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * POST /api/doc-login/consults/patients/[id]/orders — schedule a test or start
 * a medication for one of the doctor's care-plan members.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const [patient, profile] = await Promise.all([
      prisma.consultPatient.findUnique({ where: { id: params.id } }),
      prisma.doctorProfile.findUnique({
        where: { email },
        select: { consult_approved: true, full_name: true, prefix: true },
      }),
    ]);
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    if (!profile?.consult_approved) {
      return NextResponse.json(
        { error: "Your care-plan credentials haven't been approved yet." },
        { status: 403 }
      );
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid order." }, { status: 400 });
    }
    const d = parsed.data;
    const doctorName = profile.full_name
      ? `${profile.prefix ? `${profile.prefix} ` : ""}${profile.full_name}`
      : "Your doctor";

    if (d.kind === "prescription") {
      const start = parseDate(d.start_date) ?? new Date();
      // An end date is only implied when a course length was given — an
      // open-ended maintenance drug has none.
      const end = d.duration_days
        ? new Date(start.getTime() + d.duration_days * 24 * 60 * 60 * 1000)
        : null;

      const created = await prisma.consultPrescription.create({
        data: {
          patient_id: patient.id,
          doctor_email: email,
          medication: d.medication,
          dosage: d.dosage || null,
          frequency: d.frequency || null,
          duration_days: d.duration_days ?? null,
          instructions: d.instructions || null,
          start_date: start,
          end_date: end,
        },
      });

      void notifyMember(patient.email, patient.full_name, doctorName, "medication",
        [d.medication, d.dosage, d.frequency].filter(Boolean).join(" · "),
        d.duration_days ? `For ${d.duration_days} days from ${start.toDateString()}` : "Ongoing"
      ).catch((e) => console.error("[orders] member email:", e));

      return NextResponse.json({ success: true, id: created.id });
    }

    const due = parseDate(d.due_date);
    const created = await prisma.consultTestOrder.create({
      data: {
        patient_id: patient.id,
        doctor_email: email,
        tests: d.tests,
        reason: d.reason || null,
        due_date: due,
        recurrence: d.recurrence ?? "once",
      },
    });

    void notifyMember(patient.email, patient.full_name, doctorName, "tests", d.tests,
      due ? `Due by ${due.toDateString()}` : null
    ).catch((e) => console.error("[orders] member email:", e));

    return NextResponse.json({ success: true, id: created.id });
  } catch (err) {
    console.error("[doc-login/consults/orders POST]", err);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}

const PatchSchema = z.object({
  kind: z.enum(["prescription", "test"]),
  id: z.string().min(1),
  status: z.enum(["active", "completed", "stopped", "scheduled", "done", "cancelled"]),
  note: z.string().trim().max(600).optional().nullable(),
});

/**
 * PATCH — mark a test done (or cancelled), stop a medication.
 *
 * Completing a recurring test order schedules the next one, so a monitoring
 * schedule keeps running without the doctor re-entering it.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({ where: { id: params.id } });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid change." }, { status: 400 });
    const d = parsed.data;

    if (d.kind === "prescription") {
      const existing = await prisma.consultPrescription.findUnique({ where: { id: d.id } });
      if (!existing || existing.patient_id !== patient.id) {
        return NextResponse.json({ error: "Prescription not found." }, { status: 404 });
      }
      await prisma.consultPrescription.update({
        where: { id: d.id },
        data: { status: d.status, stopped_note: d.note || null },
      });
      return NextResponse.json({ success: true });
    }

    const order = await prisma.consultTestOrder.findUnique({ where: { id: d.id } });
    if (!order || order.patient_id !== patient.id) {
      return NextResponse.json({ error: "Test order not found." }, { status: 404 });
    }

    await prisma.consultTestOrder.update({
      where: { id: d.id },
      data: {
        status: d.status,
        result_note: d.note || null,
        completed_at: d.status === "done" ? new Date() : null,
      },
    });

    if (d.status === "done" && order.recurrence !== "once") {
      const CADENCE: Record<string, number> = { monthly: 1, quarterly: 3, biannual: 6, annual: 12 };
      const months = CADENCE[order.recurrence] ?? 0;
      if (months > 0) {
        const next = new Date(order.due_date ?? new Date());
        next.setMonth(next.getMonth() + months);
        await prisma.consultTestOrder.create({
          data: {
            patient_id: patient.id,
            doctor_email: email,
            tests: order.tests,
            reason: order.reason,
            due_date: next,
            recurrence: order.recurrence,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/consults/orders PATCH]", err);
    return NextResponse.json({ error: "Could not update that." }, { status: 500 });
  }
}

async function notifyMember(
  to: string,
  memberName: string,
  doctorName: string,
  kind: "tests" | "medication",
  summary: string,
  dueLine: string | null
) {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: kind === "tests" ? "Your doctor scheduled a test" : "Your doctor updated your medication",
    html: carePlanOrderEmail({
      memberName,
      doctorName,
      kind,
      summary,
      dueLine,
      dashboardUrl: `${appUrl()}/dashboard?tab=care`,
    }),
  });
}
