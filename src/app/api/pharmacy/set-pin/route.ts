export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPharmacyFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * POST /api/pharmacy/set-pin — set or change the sign-in PIN.
 *
 * Requires a live session, so a PIN can only be set by someone who has just
 * proved they hold the pharmacy's inbox. An empty PIN clears it, sending them
 * back to emailed codes.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { pin } = await req.json();
    const trimmedPin = String(pin ?? "").trim();
    if (trimmedPin !== "" && !/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    await prisma.pharmacy.update({
      where: { id: pharmacy.id },
      data: { pin_hash: trimmedPin ? createHash("sha256").update(trimmedPin).digest("hex") : null },
    });

    return NextResponse.json({ success: true, has_pin: !!trimmedPin });
  } catch (err) {
    console.error("[pharmacy/set-pin]", err);
    return NextResponse.json({ error: "Could not save your PIN." }, { status: 500 });
  }
}
