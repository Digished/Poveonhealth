export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getConsultSettings } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/** GET /api/consults/settings — the public price and what the plan includes. */
export async function GET() {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  const s = await getConsultSettings();
  return NextResponse.json({
    success: true,
    settings: {
      price_naira: s.price_naira,
      message_allowance: s.message_allowance,
      lab_discount_percent: s.lab_discount_percent,
      pharmacy_discount_percent: s.pharmacy_discount_percent,
    },
  });
}
