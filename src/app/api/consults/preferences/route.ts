export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPatientEmailFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";
import { lockMessage, pharmacyLock } from "@/lib/pharmacy-lock";

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

    const member = await prisma.consultPatient.findUnique({
      where: { email },
      select: {
        id: true,
        preferred_pharmacy_id: true,
        preferred_pharmacy_set_at: true,
        first_pharmacy_id: true,
      },
    });
    if (!member) return NextResponse.json({ error: "You're not on the care plan." }, { status: 404 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid choice." }, { status: 400 });
    const d = parsed.data;

    // The pharmacy settles for 30 days once chosen. Enforced here rather than
    // only in the dialog, because the dialog is a courtesy and this is the rule
    // the pharmacy is relying on. A *first* choice is never a switch, and
    // choosing the same pharmacy again changes nothing, so both pass through.
    const changingPharmacy =
      d.preferred_pharmacy_id !== undefined &&
      d.preferred_pharmacy_id !== member.preferred_pharmacy_id;
    if (changingPharmacy && member.preferred_pharmacy_id) {
      const lock = pharmacyLock(member.preferred_pharmacy_set_at);
      if (lock.locked) {
        const current = await prisma.pharmacy.findUnique({
          where: { id: member.preferred_pharmacy_id },
          select: { name: true },
        });
        return NextResponse.json(
          {
            error: lockMessage(lock, current?.name ?? null),
            locked_until: lock.unlocksOn,
            days_left: lock.daysLeft,
          },
          { status: 409 }
        );
      }
    }

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

    const now = new Date();
    await prisma.consultPatient.update({
      where: { id: member.id },
      data: {
        ...(d.preferred_pharmacy_id !== undefined
          ? {
              preferred_pharmacy_id: d.preferred_pharmacy_id,
              // The clock restarts on a real change, and stops when they clear
              // it — nothing is held to a pharmacy they no longer have.
              preferred_pharmacy_set_at: changingPharmacy
                ? d.preferred_pharmacy_id
                  ? now
                  : null
                : member.preferred_pharmacy_set_at,
              // The first pharmacy a member ever picks is what the pharmacy is
              // credited with, so it is written once and never again.
              ...(d.preferred_pharmacy_id && !member.first_pharmacy_id
                ? { first_pharmacy_id: d.preferred_pharmacy_id, first_pharmacy_at: now }
                : {}),
            }
          : {}),
        ...(d.preferred_lab_id !== undefined ? { preferred_lab_id: d.preferred_lab_id } : {}),
        ...(d.share_history !== undefined ? { share_history: d.share_history } : {}),
      },
    });

    const lock = pharmacyLock(
      changingPharmacy && d.preferred_pharmacy_id ? now : member.preferred_pharmacy_set_at
    );
    return NextResponse.json({
      success: true,
      pharmacy_locked_until: lock.unlocksOn,
      pharmacy_days_left: lock.daysLeft,
    });
  } catch (err) {
    console.error("[consults/preferences]", err);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
