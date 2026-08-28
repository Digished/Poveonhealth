export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getConsultSettings } from "@/lib/consult";

/** GET /api/consults/settings — the public price and what the plan includes. */
export async function GET() {
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
