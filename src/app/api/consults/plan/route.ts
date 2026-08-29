export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMemberFromRequest } from "@/lib/consult";
import { itemState } from "@/lib/treatment-plan";
import { rateReading, worse, type RiskLevel } from "@/lib/care-risk";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  item_id: z.string().min(1),
  /** Ticking is the normal case; untick undoes a misplaced tap. */
  done: z.boolean().default(true),
  /** What they measured, when the item asks for a number. */
  systolic: z.coerce.number().int().min(40).max(300).optional().nullable(),
  diastolic: z.coerce.number().int().min(20).max(200).optional().nullable(),
  glucose_mg_dl: z.coerce.number().min(10).max(900).optional().nullable(),
  weight_kg: z.coerce.number().min(10).max(400).optional().nullable(),
  value_number: z.coerce.number().min(0).max(100000).optional().nullable(),
  value_text: z.string().trim().max(300).optional().nullable(),
  note: z.string().trim().max(600).optional().nullable(),
});

/**
 * POST /api/consults/plan — the member ticks something off, and says how it went.
 *
 * Ticking records when, not that: the next time it comes due is worked out from
 * the item's cadence, so nothing has to be scheduled in advance and a missed
 * week never becomes a backlog.
 *
 * A tick can carry a reading. That is the part the doctor actually reads — a
 * count of ticks says someone pressed a button, a series of readings says how
 * they are doing. A reading also re-rates the member, so a bad one surfaces on
 * their doctor's list immediately rather than at the next visit.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change." }, { status: 400 });
    }
    const d = parsed.data;

    const item = await prisma.consultTreatmentItem.findUnique({
      where: { id: d.item_id },
      select: {
        id: true, cadence: true, done_count: true, measure: true, label: true,
        plan: { select: { patient_id: true } },
      },
    });
    if (!item || item.plan.patient_id !== member.id) {
      return NextResponse.json({ error: "That isn't on your plan." }, { status: 404 });
    }

    const hasReading =
      d.systolic != null || d.diastolic != null || d.glucose_mg_dl != null ||
      d.weight_kg != null || d.value_number != null ||
      !!d.value_text?.trim() || !!d.note?.trim();

    const updated = await prisma.consultTreatmentItem.update({
      where: { id: item.id },
      data: d.done
        ? { last_done_at: new Date(), done_count: { increment: 1 } }
        : { last_done_at: null, done_count: Math.max(0, item.done_count - 1) },
      select: { id: true, cadence: true, last_done_at: true, done_count: true },
    });

    // Only a tick creates a log — unticking is a correction, not an entry.
    let logged = null;
    if (d.done && hasReading) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      logged = await prisma.consultPlanLog.create({
        data: {
          item_id: item.id,
          patient_id: member.id,
          note: d.note?.trim() || null,
          systolic: d.systolic ?? null,
          diastolic: d.diastolic ?? null,
          glucose_mg_dl: d.glucose_mg_dl ?? null,
          weight_kg: d.weight_kg ?? null,
          value_number: d.value_number ?? null,
          value_text: d.value_text?.trim() || null,
          logged_for: today,
        },
      });
    }

    // A reading re-rates them, so a bad one is on the doctor's list at once.
    let risk: { level: RiskLevel; reason: string | null } | null = null;
    if (logged && (d.systolic != null || d.glucose_mg_dl != null)) {
      const rated = rateReading({
        systolic: d.systolic,
        diastolic: d.diastolic,
        glucose_mg_dl: d.glucose_mg_dl,
        // The plan does not ask fasting or not, so read it the cautious way.
        glucose_context: "fasting",
      });
      // Never quietly downgrade on one good reading: a doctor clears a flag by
      // looking, and a single normal day does not undo a run of bad ones.
      const current = (member.risk_level ?? "none") as RiskLevel;
      const level = worse(current, rated.level);
      if (level !== current || rated.level !== "none") {
        await prisma.consultPatient.update({
          where: { id: member.id },
          data: {
            risk_level: level,
            risk_reason: rated.reason ?? (level === current ? undefined : null),
            risk_rated_at: new Date(),
          },
        });
      }
      risk = rated;
    }

    return NextResponse.json({
      success: true,
      item: { id: updated.id, done_count: updated.done_count, ...itemState(updated) },
      logged: logged ? { id: logged.id, logged_for: logged.logged_for } : null,
      risk,
    });
  } catch (err) {
    console.error("[consults/plan]", err);
    return NextResponse.json({ error: "Could not update your plan." }, { status: 500 });
  }
}

/** GET — the member's own log history for one item, or all of them. */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const itemId = req.nextUrl.searchParams.get("item_id");
    const logs = await prisma.consultPlanLog.findMany({
      where: { patient_id: member.id, ...(itemId ? { item_id: itemId } : {}) },
      orderBy: { logged_for: "desc" },
      take: 120,
      include: { item: { select: { label: true, measure: true, measure_label: true } } },
    });

    return NextResponse.json({
      success: true,
      logs: logs.map((l) => ({
        id: l.id,
        item_id: l.item_id,
        item_label: l.item.label,
        measure: l.item.measure,
        measure_label: l.item.measure_label,
        note: l.note,
        systolic: l.systolic,
        diastolic: l.diastolic,
        glucose_mg_dl: l.glucose_mg_dl == null ? null : Number(l.glucose_mg_dl),
        weight_kg: l.weight_kg == null ? null : Number(l.weight_kg),
        value_number: l.value_number == null ? null : Number(l.value_number),
        value_text: l.value_text,
        logged_for: l.logged_for,
        created_at: l.created_at,
      })),
    });
  } catch (err) {
    console.error("[consults/plan GET]", err);
    return NextResponse.json({ error: "Could not load your log." }, { status: 500 });
  }
}
