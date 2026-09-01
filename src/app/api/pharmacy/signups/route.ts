export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPharmacyFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/pharmacy/signups — members who joined Poveon and named this
 * pharmacy as their first.
 *
 * This is what a pharmacy is paid for bringing in, so it is counted on the
 * choice that was actually made at sign-up (`first_pharmacy_id`) rather than on
 * who the member is with today. A member who later moves is still a member this
 * pharmacy brought in; showing the current list instead would quietly delete
 * their credit every time somebody switched.
 *
 * Whether each one is *still* with them is returned alongside, because that is
 * the other question a pharmacy owner has and it should not need a second
 * screen.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const members = await prisma.consultPatient.findMany({
      where: {
        first_pharmacy_id: pharmacy.id,
        // Only members who actually paid. An abandoned form is not a sign-up
        // and must never be counted towards what a pharmacy is owed.
        status: { in: ["active", "expired", "cancelled"] },
      },
      orderBy: { first_pharmacy_at: "desc" },
      take: 2000,
      select: {
        id: true,
        full_name: true,
        code: true,
        status: true,
        conditions: true,
        expires_at: true,
        first_pharmacy_at: true,
        subscribed_at: true,
        preferred_pharmacy_id: true,
      },
    });

    const now = new Date();
    return NextResponse.json({
      success: true,
      signups: members.map((m) => ({
        id: m.id,
        full_name: m.full_name,
        code: m.code,
        conditions: m.conditions,
        // The sign-up date is when they chose; older rows predate the column
        // and fall back to when they paid.
        joined_at: m.first_pharmacy_at ?? m.subscribed_at,
        still_with_you: m.preferred_pharmacy_id === pharmacy.id,
        active: m.status === "active" && (!m.expires_at || m.expires_at > now),
      })),
    });
  } catch (err) {
    console.error("[pharmacy/signups]", err);
    return NextResponse.json({ error: "Could not load your sign-ups." }, { status: 500 });
  }
}
