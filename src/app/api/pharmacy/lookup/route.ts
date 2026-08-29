export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getPharmacyFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({ code: z.string().trim().min(4).max(32) });

/**
 * POST /api/pharmacy/lookup — is this care code good for a discount?
 *
 * Returns only what the counter needs to serve the person: their first name,
 * whether the plan is live, and the discount to apply. No clinical detail.
 */
export async function POST(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a care code." }, { status: 400 });

    const code = parsed.data.code.toUpperCase().replace(/\s+/g, "");
    const member = await prisma.consultPatient.findUnique({
      where: { code },
      select: { id: true, full_name: true, status: true, expires_at: true },
    });

    if (!member) {
      return NextResponse.json({ success: true, found: false, reason: "That code is not recognised." });
    }
    if (member.status !== "active" || (member.expires_at && member.expires_at < new Date())) {
      return NextResponse.json({
        success: true,
        found: true,
        valid: false,
        reason: "That care plan is not active.",
        member: { full_name: member.full_name },
      });
    }

    const settings = await getConsultSettings();
    return NextResponse.json({
      success: true,
      found: true,
      valid: true,
      discount_percent: pharmacy.discount_percent || settings.pharmacy_discount_percent,
      member: {
        id: member.id,
        full_name: member.full_name,
        expires_at: member.expires_at,
      },
    });
  } catch (err) {
    console.error("[pharmacy/lookup]", err);
    return NextResponse.json({ error: "Could not check that code." }, { status: 500 });
  }
}
