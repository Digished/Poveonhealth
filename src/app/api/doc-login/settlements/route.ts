export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromRequest, fetchSubaccountSettlements, nextWorkingDay } from "@/lib/doctor-encounter";

/**
 * GET /api/doc-login/settlements — the doctor's Paystack payout (settlement)
 * history and a next-payout estimate. Payouts settle T+1 working day to the
 * doctor's bank; this surfaces the live status from Paystack.
 */
export async function GET(req: NextRequest) {
  const email = await getDoctorEmailFromRequest(req);
  if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const profile = await prisma.doctorProfile.findUnique({ where: { email } });
  if (!profile?.paystack_subaccount_code) {
    return NextResponse.json({ success: true, configured: false, settlements: [] });
  }

  const settlements = await fetchSubaccountSettlements(profile.paystack_subaccount_code);
  if (settlements === null) {
    // Paystack unavailable or not configured — don't error the dashboard.
    return NextResponse.json({ success: true, configured: true, unavailable: true, settlements: [] });
  }

  const totalSettled = settlements.filter((s) => s.status === "success").reduce((sum, s) => sum + s.amountNaira, 0);
  const pending = settlements.filter((s) => s.status === "pending" || s.status === "processing");
  const pendingAmount = pending.reduce((sum, s) => sum + s.amountNaira, 0);

  return NextResponse.json({
    success: true,
    configured: true,
    bank_name: profile.bank_name ?? null,
    account_number: profile.account_number ? `••••${profile.account_number.slice(-4)}` : null,
    summary: {
      total_settled: Math.round(totalSettled),
      pending_amount: Math.round(pendingAmount),
      pending_count: pending.length,
      next_payout_estimate: nextWorkingDay().toISOString(),
    },
    settlements,
  });
}
