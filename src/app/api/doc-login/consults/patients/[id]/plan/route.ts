export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { itemState } from "@/lib/treatment-plan";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const ItemSchema = z.object({
  id: z.string().optional().nullable(),
  label: z.string().trim().min(2, "Write what to do").max(160),
  detail: z.string().trim().max(400).optional().nullable(),
  cadence: z.enum(["daily", "weekly", "biweekly", "monthly", "once"]).default("weekly"),
  remind: z.boolean().default(true),
  /** What to ask the member to record when they tick it. */
  measure: z.enum(["none", "bp", "glucose", "weight", "number", "text"]).default("none"),
  measure_label: z.string().trim().max(60).optional().nullable(),
});

const PlanSchema = z.object({
  title: z.string().trim().min(2).max(120).default("Treatment plan"),
  note: z.string().trim().max(1000).optional().nullable(),
  items: z.array(ItemSchema).min(1, "Add at least one thing to do").max(25),
});

async function requireMember(req: NextRequest, id: string) {
  const email = await getDoctorEmailFromConsultRequest(req);
  if (!email) return { error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }) };
  const patient = await prisma.consultPatient.findUnique({
    where: { id },
    select: { id: true, doctor_email: true },
  });
  if (!patient || patient.doctor_email !== email) {
    return { error: NextResponse.json({ error: "Member not found." }, { status: 404 }) };
  }
  return { email, patient };
}

/** GET — the member's current plan, with what is due right now. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const ctx = await requireMember(req, params.id);
    if ("error" in ctx) return ctx.error;

    const plan = await prisma.consultTreatmentPlan.findFirst({
      where: { patient_id: ctx.patient.id, status: "active" },
      orderBy: { created_at: "desc" },
      include: { items: { orderBy: { position: "asc" } } },
    });

    return NextResponse.json({ success: true, plan: plan ? serialisePlan(plan) : null });
  } catch (err) {
    console.error("[doc-login/consults/plan GET]", err);
    return NextResponse.json({ error: "Could not load the plan." }, { status: 500 });
  }
}

/**
 * PUT — write the plan.
 *
 * A checklist is small and gets reshuffled constantly, so the whole thing is
 * replaced in one transaction rather than diffed field by field. Items the
 * doctor kept are matched by id so a member's ticks and streak survive the
 * rewrite; anything dropped goes with the old plan.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const ctx = await requireMember(req, params.id);
    if ("error" in ctx) return ctx.error;
    const { email, patient } = ctx;

    const parsed = PlanSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid plan." }, { status: 400 });
    }
    const d = parsed.data;

    const existing = await prisma.consultTreatmentPlan.findFirst({
      where: { patient_id: patient.id, status: "active" },
      orderBy: { created_at: "desc" },
      include: { items: { select: { id: true, last_done_at: true, done_count: true } } },
    });

    const keptHistory = new Map(existing?.items.map((i) => [i.id, i]) ?? []);
    const keptIds = d.items.map((i) => i.id).filter((id): id is string => !!id && keptHistory.has(id));

    const plan = existing
      ? await prisma.$transaction(async (tx) => {
          await tx.consultTreatmentPlan.update({
            where: { id: existing.id },
            data: {
              title: d.title,
              note: d.note || null,
              doctor_email: email,
              // Saving a drafted plan is confirming it. From here it is the
              // doctor's plan, and the member is shown it as one.
              source: "doctor",
              reviewed_at: new Date(),
              reviewed_by: email,
            },
          });
          // Drop what the doctor removed, then rewrite the rest in order.
          await tx.consultTreatmentItem.deleteMany({
            where: { plan_id: existing.id, id: { notIn: keptIds.length ? keptIds : ["-"] } },
          });
          for (let position = 0; position < d.items.length; position += 1) {
            const item = d.items[position];
            const prior = item.id ? keptHistory.get(item.id) : undefined;
            if (prior) {
              await tx.consultTreatmentItem.update({
                where: { id: prior.id },
                data: {
                  label: item.label,
                  detail: item.detail || null,
                  cadence: item.cadence,
                  remind: item.remind,
                  measure: item.measure,
                  measure_label: item.measure_label || null,
                  position,
                },
              });
            } else {
              await tx.consultTreatmentItem.create({
                data: {
                  plan_id: existing.id,
                  label: item.label,
                  detail: item.detail || null,
                  cadence: item.cadence,
                  remind: item.remind,
                  measure: item.measure,
                  measure_label: item.measure_label || null,
                  position,
                },
              });
            }
          }
          return tx.consultTreatmentPlan.findUniqueOrThrow({
            where: { id: existing.id },
            include: { items: { orderBy: { position: "asc" } } },
          });
        })
      : await prisma.consultTreatmentPlan.create({
          data: {
            patient_id: patient.id,
            doctor_email: email,
            title: d.title,
            note: d.note || null,
            source: "doctor",
            reviewed_at: new Date(),
            reviewed_by: email,
            items: {
              create: d.items.map((item, position) => ({
                label: item.label,
                detail: item.detail || null,
                cadence: item.cadence,
                remind: item.remind,
                measure: item.measure,
                measure_label: item.measure_label || null,
                position,
              })),
            },
          },
          include: { items: { orderBy: { position: "asc" } } },
        });

    return NextResponse.json({ success: true, plan: serialisePlan(plan) });
  } catch (err) {
    console.error("[doc-login/consults/plan PUT]", err);
    return NextResponse.json({ error: "Could not save the plan." }, { status: 500 });
  }
}

type PlanRow = {
  id: string;
  title: string;
  note: string | null;
  source?: string;
  reviewed_at?: Date | null;
  notified_at: Date | null;
  updated_at: Date;
  items: {
    id: string;
    label: string;
    detail: string | null;
    cadence: string;
    remind: boolean;
    measure: string;
    measure_label: string | null;
    position: number;
    last_done_at: Date | null;
    done_count: number;
  }[];
};

function serialisePlan(plan: PlanRow) {
  return {
    id: plan.id,
    title: plan.title,
    note: plan.note,
    source: plan.source ?? "doctor",
    reviewed_at: plan.reviewed_at ?? null,
    notified_at: plan.notified_at,
    updated_at: plan.updated_at,
    items: plan.items.map((i) => ({
      id: i.id,
      label: i.label,
      detail: i.detail,
      cadence: i.cadence,
      remind: i.remind,
      measure: i.measure,
      measure_label: i.measure_label,
      done_count: i.done_count,
      ...itemState(i),
    })),
  };
}
