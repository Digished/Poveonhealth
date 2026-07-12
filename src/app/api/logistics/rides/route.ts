export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLogisticsAuth } from "@/lib/logistics-auth";

/**
 * GET /api/logistics/rides — rides for this partner's assigned labs. The partner
 * only ever sees the patient's first name, phone and pickup location.
 */
export async function GET(req: NextRequest) {
  const auth = await getLogisticsAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const links = await prisma.logisticsPartnerLab.findMany({ where: { partner_id: auth.partner_id } });
  const labIds = links.map((l) => l.lab_id);
  if (labIds.length === 0) return NextResponse.json({ success: true, rides: [], riders: [] });

  // Rides for the partner's labs: pending (unassigned) OR already assigned to this partner.
  const rides = await prisma.ridePerk.findMany({
    where: {
      lab_id: { in: labIds },
      OR: [
        { partner_id: auth.partner_id },
        { partner_id: null, status: "pending" },
      ],
    },
    orderBy: { created_at: "desc" },
    take: 300,
  });

  const riders = await prisma.rider.findMany({
    where: { partner_id: auth.partner_id },
    orderBy: { created_at: "desc" },
  });
  const riderById = new Map(riders.map((r) => [r.id, r]));

  return NextResponse.json({
    success: true,
    rides: rides.map((r) => ({
      id: r.id,
      status: r.status,
      patient_first_name: (r.patient_name || "").trim().split(/\s+/)[0] || r.patient_name,
      patient_phone: r.patient_phone,
      pickup_address: r.pickup_address,
      destination_lab: r.destination_lab,
      destination_address: r.destination_address,
      rider_id: r.rider_id,
      rider_name: r.rider_id ? riderById.get(r.rider_id)?.name ?? null : null,
      redeem_by: r.redeem_by,
      created_at: r.created_at,
      completed_at: r.completed_at,
    })),
    riders: riders
      .filter((r) => r.is_active)
      .map((r) => ({ id: r.id, name: r.name, phone: r.phone })),
  });
}
