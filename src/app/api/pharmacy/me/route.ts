export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getPharmacyFromRequest } from "@/lib/consult";

/** GET /api/pharmacy/me — the signed-in pharmacy, with its headline numbers. */
export async function GET(req: NextRequest) {
  try {
    const pharmacy = await getPharmacyFromRequest(req);
    if (!pharmacy) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [customerCount, carePlanCount, redemptions, settings] = await Promise.all([
      prisma.pharmacyCustomer.count({ where: { pharmacy_id: pharmacy.id } }),
      prisma.pharmacyCustomer.count({ where: { pharmacy_id: pharmacy.id, patient_id: { not: null } } }),
      prisma.consultRedemption.aggregate({
        where: { pharmacy_id: pharmacy.id, created_at: { gte: monthStart } },
        _sum: { gross_naira: true, discount_naira: true },
        _count: { id: true },
      }),
      getConsultSettings(),
    ]);

    return NextResponse.json({
      success: true,
      pharmacy: {
        id: pharmacy.id,
        name: pharmacy.name,
        code: pharmacy.code,
        email: pharmacy.email,
        phone: pharmacy.phone,
        address: pharmacy.address,
        city: pharmacy.city,
        state: pharmacy.state,
        discount_percent: pharmacy.discount_percent || settings.pharmacy_discount_percent,
      },
      stats: {
        customers: customerCount,
        care_plan_customers: carePlanCount,
        redemptions_this_month: redemptions._count.id,
        gross_this_month: Math.round(Number(redemptions._sum.gross_naira ?? 0)),
        discount_this_month: Math.round(Number(redemptions._sum.discount_naira ?? 0)),
      },
    });
  } catch (err) {
    console.error("[pharmacy/me]", err);
    return NextResponse.json({ error: "Could not load your pharmacy." }, { status: 500 });
  }
}
