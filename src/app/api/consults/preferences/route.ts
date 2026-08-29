export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPatientEmailFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  preferred_pharmacy_id: z.string().min(1).nullable().optional(),
  preferred_lab_id: z.string().min(1).nullable().optional(),
  /** Whether a new doctor inherits the conversation and notes. */
  share_history: z.boolean().optional(),
});

/**
 * PATCH /api/consults/preferences — change the member's preferred pharmacy or
 * lab. A preference, not a restriction: the care code still works anywhere.
 */
export async function PATCH(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getPatientEmailFromRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const member = await prisma.consultPatient.findUnique({ where: { email }, select: { id: true } });
    if (!member) return NextResponse.json({ error: "You're not on the care plan." }, { status: 404 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid choice." }, { status: 400 });
    const d = parsed.data;

    // Only accept partners that actually exist and are open for business.
    if (d.preferred_pharmacy_id) {
      const ok = await prisma.pharmacy.findFirst({
        where: { id: d.preferred_pharmacy_id, active: true },
        select: { id: true },
      });
      if (!ok) return NextResponse.json({ error: "That pharmacy isn't available." }, { status: 404 });
    }
    if (d.preferred_lab_id) {
      const ok = await prisma.lab.findFirst({
        where: { id: d.preferred_lab_id, hidden: false },
        select: { id: true },
      });
      if (!ok) return NextResponse.json({ error: "That laboratory isn't available." }, { status: 404 });
    }

    await prisma.consultPatient.update({
      where: { id: member.id },
      data: {
        ...(d.preferred_pharmacy_id !== undefined ? { preferred_pharmacy_id: d.preferred_pharmacy_id } : {}),
        ...(d.preferred_lab_id !== undefined ? { preferred_lab_id: d.preferred_lab_id } : {}),
        ...(d.share_history !== undefined ? { share_history: d.share_history } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[consults/preferences]", err);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
