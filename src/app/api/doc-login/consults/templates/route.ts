export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * A doctor's saved starting points.
 *
 * - treatment_plan: { title, note, items: [{ label, detail, cadence, remind }] }
 * - test_panel:     { tests, reason, recurrence }
 * - medication:     { text }  — the natural-language line, parsed on use
 */
const KINDS = ["treatment_plan", "test_panel", "medication"] as const;

const PlanPayload = z.object({
  title: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional().nullable(),
  items: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(160),
        detail: z.string().trim().max(400).optional().nullable(),
        cadence: z.enum(["daily", "weekly", "biweekly", "monthly", "once"]).default("weekly"),
        remind: z.boolean().default(true),
      })
    )
    .min(1)
    .max(25),
});

const PanelPayload = z.object({
  tests: z.string().trim().min(2).max(600),
  reason: z.string().trim().max(400).optional().nullable(),
  recurrence: z.enum(["once", "monthly", "quarterly", "biannual", "annual"]).default("once"),
});

const MedicationPayload = z.object({ text: z.string().trim().min(3).max(4000) });

const CreateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("treatment_plan"), name: z.string().trim().min(2).max(80), payload: PlanPayload }),
  z.object({ kind: z.literal("test_panel"), name: z.string().trim().min(2).max(80), payload: PanelPayload }),
  z.object({ kind: z.literal("medication"), name: z.string().trim().min(2).max(80), payload: MedicationPayload }),
]);

/** GET — the doctor's templates, optionally of one kind. */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const kindParam = req.nextUrl.searchParams.get("kind");
    const kind = KINDS.find((k) => k === kindParam);

    const templates = await prisma.consultTemplate.findMany({
      where: { doctor_email: email, ...(kind ? { kind } : {}) },
      orderBy: [{ uses: "desc" }, { updated_at: "desc" }],
      take: 100,
    });

    return NextResponse.json({ success: true, templates });
  } catch (err) {
    console.error("[doc-login/consults/templates GET]", err);
    return NextResponse.json({ error: "Could not load your templates." }, { status: 500 });
  }
}

/** POST — save a new template, or overwrite one of the same name and kind. */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = CreateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid template." }, { status: 400 });
    }
    const d = parsed.data;

    // Saving under a name they already used replaces it — a doctor refining a
    // template expects to end up with one, not two.
    const existing = await prisma.consultTemplate.findFirst({
      where: { doctor_email: email, kind: d.kind, name: { equals: d.name, mode: "insensitive" } },
      select: { id: true },
    });

    const template = existing
      ? await prisma.consultTemplate.update({
          where: { id: existing.id },
          data: { payload: d.payload, name: d.name },
        })
      : await prisma.consultTemplate.create({
          data: { doctor_email: email, kind: d.kind, name: d.name, payload: d.payload },
        });

    return NextResponse.json({ success: true, template });
  } catch (err) {
    console.error("[doc-login/consults/templates POST]", err);
    return NextResponse.json({ error: "Could not save that template." }, { status: 500 });
  }
}

/** PATCH — count a use, so the most-used templates float to the top. */
export async function PATCH(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { id } = await req.json().catch(() => ({ id: "" }));
    if (!id) return NextResponse.json({ error: "No template given." }, { status: 400 });

    await prisma.consultTemplate.updateMany({
      where: { id, doctor_email: email },
      data: { uses: { increment: 1 } },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/consults/templates PATCH]", err);
    return NextResponse.json({ error: "Could not update that template." }, { status: 500 });
  }
}

/** DELETE — remove one of the doctor's own templates. */
export async function DELETE(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "No template given." }, { status: 400 });

    const { count } = await prisma.consultTemplate.deleteMany({ where: { id, doctor_email: email } });
    if (!count) return NextResponse.json({ error: "Template not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/consults/templates DELETE]", err);
    return NextResponse.json({ error: "Could not remove that template." }, { status: 500 });
  }
}
