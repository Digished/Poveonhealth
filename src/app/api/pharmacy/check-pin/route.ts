export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * POST /api/pharmacy/check-pin — does this pharmacy already have a PIN?
 *
 * Answers `false` for an address that isn't a partner too, so the sign-in page
 * can't be used to discover who is on the network.
 */
export async function POST(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      select: { pin_hash: true, active: true },
    });

    return NextResponse.json({ hasPin: !!(pharmacy?.active && pharmacy.pin_hash) });
  } catch (err) {
    console.error("[pharmacy/check-pin]", err);
    return NextResponse.json({ error: "Failed to check." }, { status: 500 });
  }
}
