export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSkinPrice } from "@/lib/skin-consult";

/** GET /api/skin/price — public consultation fee in Naira (0 = free) */
export async function GET() {
  const price = await getSkinPrice();
  return NextResponse.json({ success: true, price });
}
