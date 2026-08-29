export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getConsultSettings } from "@/lib/consult";
import { getLabAuth } from "@/lib/lab-auth";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  code: z.string().trim().min(4).max(32),
  items: z
    .array(
      z.object({
        test_order_id: z.string().min(1),
        status: z.enum(["done", "declined"]),
        note: z.string().trim().max(300).optional().nullable(),
      })
    )
    .min(1, "Tick what was run")
    .max(30),
  gross_naira: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
});

/**
 * POST /api/lab/care-fulfil — record which scheduled tests were actually run.
 *
 * Marking one done closes the doctor's order, applies the discount, and — for a
 * recurring order — schedules the next one, exactly as it would if the doctor
 * had ticked it themselves.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const auth = await getLabAuth(req);
    if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid entry." }, { status: 400 });
    }
    const d = parsed.data;

    const code = d.code.toUpperCase().replace(/\s+/g, "");
    const member = await prisma.consultPatient.findUnique({ where: { code } });
    if (!member || member.status !== "active" || (member.expires_at && member.expires_at < new Date())) {
      return NextResponse.json({ error: "That care plan is not active." }, { status: 404 });
    }

    const owned = await prisma.consultTestOrder.findMany({
      where: { patient_id: member.id, id: { in: d.items.map((i) => i.test_order_id) } },
    });
    const byId = new Map(owned.map((o) => [o.id, o]));
    const items = d.items.filter((i) => byId.has(i.test_order_id));
    if (items.length === 0) {
      return NextResponse.json({ error: "None of those tests are on their plan." }, { status: 400 });
    }

    const settings = await getConsultSettings();
    const gross = d.gross_naira ? Math.round(d.gross_naira) : 0;
    const discount = gross ? Math.round((gross * settings.lab_discount_percent) / 100) : 0;
    const done = items.filter((i) => i.status === "done");

    const lab = await prisma.lab.findUnique({ where: { id: auth.lab_id }, select: { name: true } });

    await prisma.$transaction(async (tx) => {
      await tx.consultFulfilment.createMany({
        data: items.map((i) => ({
          patient_id: member.id,
          kind: "test",
          test_order_id: i.test_order_id,
          lab_id: auth.lab_id,
          status: i.status,
          note: i.note || null,
          recorded_by: lab?.name ?? null,
        })),
      });

      for (const i of done) {
        await tx.consultTestOrder.update({
          where: { id: i.test_order_id },
          data: { status: "done", completed_at: new Date(), result_note: i.note || null },
        });

        // A repeating order books the next one, the same as when a doctor
        // marks it done from their own dashboard.
        const order = byId.get(i.test_order_id)!;
        const CADENCE: Record<string, number> = { monthly: 1, quarterly: 3, biannual: 6, annual: 12 };
        const months = CADENCE[order.recurrence] ?? 0;
        if (months > 0) {
          const next = new Date(order.due_date ?? new Date());
          next.setMonth(next.getMonth() + months);
          await tx.consultTestOrder.create({
            data: {
              patient_id: member.id,
              doctor_email: order.doctor_email,
              tests: order.tests,
              reason: order.reason,
              due_date: next,
              recurrence: order.recurrence,
            },
          });
        }
      }

      if (gross > 0) {
        await tx.consultRedemption.create({
          data: {
            patient_id: member.id,
            kind: "lab",
            description: done.length
              ? done.map((i) => byId.get(i.test_order_id)!.tests).join(", ").slice(0, 300)
              : "Lab visit",
            gross_naira: gross,
            discount_naira: discount,
          },
        });
      }
    });

    return NextResponse.json({
      success: true,
      recorded: items.length,
      done: done.length,
      discount_naira: discount,
      payable_naira: Math.max(0, gross - discount),
    });
  } catch (err) {
    console.error("[lab/care-fulfil]", err);
    return NextResponse.json({ error: "Could not record that." }, { status: 500 });
  }
}
