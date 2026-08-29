export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getMemberFromRequest } from "@/lib/consult";
import { itemState } from "@/lib/treatment-plan";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  item_id: z.string().min(1),
  /** Ticking is the normal case; untick undoes a misplaced tap. */
  done: z.boolean().default(true),
});

/**
 * POST /api/consults/plan — the member ticks something off their plan.
 *
 * Ticking records when, not that: the next time it comes due is worked out from
 * the item's cadence, so nothing has to be scheduled in advance and a missed
 * week never becomes a backlog.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid change." }, { status: 400 });

    const item = await prisma.consultTreatmentItem.findUnique({
      where: { id: parsed.data.item_id },
      select: { id: true, cadence: true, done_count: true, plan: { select: { patient_id: true } } },
    });
    if (!item || item.plan.patient_id !== member.id) {
      return NextResponse.json({ error: "That isn't on your plan." }, { status: 404 });
    }

    const updated = await prisma.consultTreatmentItem.update({
      where: { id: item.id },
      data: parsed.data.done
        ? { last_done_at: new Date(), done_count: { increment: 1 } }
        : { last_done_at: null, done_count: Math.max(0, item.done_count - 1) },
      select: { id: true, cadence: true, last_done_at: true, done_count: true },
    });

    return NextResponse.json({
      success: true,
      item: { id: updated.id, done_count: updated.done_count, ...itemState(updated) },
    });
  } catch (err) {
    console.error("[consults/plan]", err);
    return NextResponse.json({ error: "Could not update your plan." }, { status: 500 });
  }
}
