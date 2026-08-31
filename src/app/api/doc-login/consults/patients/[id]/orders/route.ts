export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateTestOrderCode, getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { parsePrescriptionBlock } from "@/lib/prescription-parse";
import { identify } from "@/lib/med-match";
import { MED_LIVE_STATUSES, MED_SUGGESTED_STATUS } from "@/lib/medication-status";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const RECURRENCES = ["once", "monthly", "quarterly", "biannual", "annual"] as const;

/**
 * A medication written the way doctors write it — "tabs amlodipine 10mg daily
 * x 1/12". One line per drug; the parser turns each into a schedule.
 */
const PrescriptionSchema = z.object({
  kind: z.literal("prescription"),
  text: z.string().trim().min(3, "Write the medication").max(4000),
  start_date: z.string().trim().optional().nullable(),
});

/** The corrected fields, when the doctor edits what the parser read. */
const PrescriptionFieldsSchema = z.object({
  kind: z.literal("prescription_fields"),
  items: z
    .array(
      z.object({
        medication: z.string().trim().min(2).max(160),
        form: z.string().trim().max(40).optional().nullable(),
        dosage: z.string().trim().max(80).optional().nullable(),
        frequency: z.string().trim().max(80).optional().nullable(),
        duration_days: z.coerce.number().int().min(1).max(3650).optional().nullable(),
        instructions: z.string().trim().max(600).optional().nullable(),
        raw_text: z.string().trim().max(400).optional().nullable(),
      })
    )
    .min(1)
    .max(20),
  start_date: z.string().trim().optional().nullable(),
});

const TestOrderSchema = z.object({
  kind: z.literal("test"),
  tests: z.string().trim().min(2, "Name the test(s)").max(600),
  reason: z.string().trim().max(400).optional().nullable(),
  due_date: z.string().trim().optional().nullable(),
  recurrence: z.enum(RECURRENCES).optional(),
});

const BodySchema = z.discriminatedUnion("kind", [
  PrescriptionSchema,
  PrescriptionFieldsSchema,
  TestOrderSchema,
]);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The doctor's member, or null — every write here goes through this check. */
async function requireMember(req: NextRequest, id: string) {
  const email = await getDoctorEmailFromConsultRequest(req);
  if (!email) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };

  const [patient, profile] = await Promise.all([
    prisma.consultPatient.findUnique({ where: { id } }),
    prisma.doctorProfile.findUnique({ where: { email }, select: { consult_approved: true } }),
  ]);
  if (!patient || patient.doctor_email !== email) {
    return { error: NextResponse.json({ error: "Member not found." }, { status: 404 }) };
  }
  return { email, patient, approved: !!profile?.consult_approved };
}

/**
 * POST /api/doc-login/consults/patients/[id]/orders — schedule tests or
 * medication for one of the doctor's care-plan members.
 *
 * Nothing here emails the member. A doctor sets up a whole schedule in one
 * sitting, and one message when they are finished beats six as they type —
 * see the `notify` route.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const ctx = await requireMember(req, params.id);
    if ("error" in ctx) return ctx.error;
    const { email, patient, approved } = ctx;
    if (!approved) {
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

    if (d.kind === "prescription" || d.kind === "prescription_fields") {
      const start = parseDate(d.start_date) ?? new Date();

      // Re-parse server-side rather than trusting the client's reading of the
      // same text, so what is stored always matches what the parser makes of
      // what the doctor wrote.
      const rows =
        d.kind === "prescription"
          ? parsePrescriptionBlock(d.text).map((p) => ({
              medication: p.medication,
              form: p.form,
              dosage: p.dosage,
              frequency: p.frequency,
              duration_days: p.duration_days,
              instructions: p.instructions,
              raw_text: p.raw_text,
            }))
          : d.items.map((i) => ({
              medication: i.medication,
              form: i.form || null,
              dosage: i.dosage || null,
              frequency: i.frequency || null,
              duration_days: i.duration_days ?? null,
              instructions: i.instructions || null,
              raw_text: i.raw_text || null,
            }));

      if (rows.length === 0) {
        return NextResponse.json(
          { error: "Couldn't read a medication in that. Try: tabs amlodipine 10mg daily x 1/12" },
          { status: 400 }
        );
      }

      // A doctor renewing a medication writes it out again, and confirming a
      // suggestion often means typing it rather than tapping it. Either way the
      // member must not end up with the same drug listed twice, so a row for
      // the same drug at the same strength — already on file, or repeated
      // within this very submission — is updated in place rather than added.
      const onFile = await prisma.consultPrescription.findMany({
        where: {
          patient_id: patient.id,
          status: { in: [...MED_LIVE_STATUSES, MED_SUGGESTED_STATUS] },
        },
        orderBy: { created_at: "desc" },
      });
      // A name that normalises to nothing cannot be judged the same as
      // anything, so it gets a key of its own and merges with nothing.
      const key = (
        m: { medication: string; dosage?: string | null; form?: string | null },
        unique: string
      ) => {
        const id = identify({ name: m.medication, dosage: m.dosage, form: m.form });
        return id.name ? `${id.name}|${id.strength ?? ""}` : `?${unique}`;
      };
      const existingByKey = new Map<string, string>();
      for (const e of onFile as { id: string; medication: string; dosage: string | null; form: string | null }[]) {
        const k = key(e, e.id);
        if (!existingByKey.has(k)) existingByKey.set(k, e.id);
      }

      // One write per drug. A line repeated in the same block is the same
      // instruction typed twice, and the later one is the one they meant.
      const writes = new Map<string, (typeof rows)[number]>();
      rows.forEach((r, i) => writes.set(key(r, `new${i}`), r));

      const created = await prisma.$transaction(
        Array.from(writes.entries()).map(([k, r]) => {
          const data = {
            medication: r.medication,
            form: r.form,
            dosage: r.dosage,
            frequency: r.frequency,
            duration_days: r.duration_days,
            instructions: r.instructions,
            raw_text: r.raw_text,
            start_date: start,
            // Only a course with a stated length has an end — an open-ended
            // maintenance drug runs until the doctor stops it.
            end_date: r.duration_days
              ? new Date(start.getTime() + r.duration_days * 24 * 60 * 60 * 1000)
              : null,
          };
          const existingId = existingByKey.get(k);
          if (existingId) {
            return prisma.consultPrescription.update({
              where: { id: existingId },
              data: {
                ...data,
                doctor_email: email,
                // Writing it out is confirming it, so a suggestion becomes the
                // doctor's own and the member can finally see it.
                status: "scheduled",
                source: "doctor",
                cancel_reason: null,
                stopped_note: null,
              },
            });
          }
          return prisma.consultPrescription.create({
            data: { patient_id: patient.id, doctor_email: email, ...data },
          });
        })
      );

      return NextResponse.json({ success: true, count: created.length, ids: created.map((c) => c.id) });
    }

    const due = parseDate(d.due_date);
    const created = await prisma.consultTestOrder.create({
      data: {
        patient_id: patient.id,
        doctor_email: email,
        // The reference the member shows at any Poveon lab.
        code: await generateTestOrderCode(),
        tests: d.tests,
        reason: d.reason || null,
        due_date: due,
        recurrence: d.recurrence ?? "once",
      },
    });

    return NextResponse.json({ success: true, id: created.id, code: created.code });
  } catch (err) {
    console.error("[doc-login/consults/orders POST]", err);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}

/** Why a medication was stopped. Asking is the point — "stopped" alone tells
 *  the next doctor nothing. */
const CANCEL_REASONS = [
  "not_effective",
  "side_effects",
  "cost",
  "not_convenient",
  "condition_resolved",
  "switched",
  "other",
] as const;

/** A field left blank in a form arrives as "", which is a no-answer, not a value. */
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const PatchSchema = z.object({
  kind: z.enum(["prescription", "test"]),
  id: z.string().min(1),
  status: z.enum(["scheduled", "active", "completed", "cancelled", "done"]),
  // Cancelling a test asks for no reason, so this arrives empty — which used
  // to fail the enum and come back as "Invalid change".
  reason: z.preprocess(emptyToNull, z.enum(CANCEL_REASONS).nullish()),
  note: z.preprocess(emptyToNull, z.string().trim().max(600).nullish()),
});

/**
 * PATCH — start or finish a medication, mark a test done, cancel either.
 *
 * Completing a recurring test order schedules the next one, so a monitoring
 * schedule keeps running without the doctor re-entering it.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const ctx = await requireMember(req, params.id);
    if ("error" in ctx) return ctx.error;
    const { email, patient } = ctx;

    const parsed = PatchSchema.safeParse(await req.json());
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: `Could not apply that change: ${issue?.path.join(".") || "request"} — ${issue?.message ?? "invalid"}` },
        { status: 400 }
      );
    }
    const d = parsed.data;

    if (d.kind === "prescription") {
      const existing = await prisma.consultPrescription.findUnique({ where: { id: d.id } });
      if (!existing || existing.patient_id !== patient.id) {
        return NextResponse.json({ error: "Medication not found." }, { status: 404 });
      }
      if (d.status === "cancelled" && !d.reason) {
        return NextResponse.json(
          { error: "Say why you're stopping it — the next doctor will need to know." },
          { status: 400 }
        );
      }
      await prisma.consultPrescription.update({
        where: { id: d.id },
        data: {
          status: d.status,
          // Acting on a suggestion makes it the doctor's own. Until then it is
          // outside MED_LIVE_STATUSES, so the member has never seen it.
          ...(existing.status === "suggested" ? { source: "doctor" } : {}),
          cancel_reason: d.status === "cancelled" ? d.reason ?? null : null,
          stopped_note: d.note || null,
        },
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
            code: await generateTestOrderCode(),
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

/** DELETE — remove an order entered by mistake, before the member sees it. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const ctx = await requireMember(req, params.id);
    if ("error" in ctx) return ctx.error;
    const { patient } = ctx;

    const kind = req.nextUrl.searchParams.get("kind");
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "Nothing to remove." }, { status: 400 });

    if (kind === "prescription") {
      const { count } = await prisma.consultPrescription.deleteMany({
        where: { id, patient_id: patient.id },
      });
      if (!count) return NextResponse.json({ error: "Medication not found." }, { status: 404 });
    } else {
      const { count } = await prisma.consultTestOrder.deleteMany({
        where: { id, patient_id: patient.id },
      });
      if (!count) return NextResponse.json({ error: "Test order not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/consults/orders DELETE]", err);
    return NextResponse.json({ error: "Could not remove that." }, { status: 500 });
  }
}
