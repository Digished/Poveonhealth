export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/lab/rides — free rides inbound to this lab, so the lab can see the
 * patients arriving via a free ride and watch each ride progress.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    if (!auth.permissions.can_view_requests) {
      return NextResponse.json({ success: false, error: "Your role does not permit viewing rides" }, { status: 403 });
    }

    const rides = await prisma.ridePerk.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: { created_at: "desc" },
      take: 300,
    });

    const partnerIds = Array.from(new Set(rides.map((r) => r.partner_id).filter(Boolean))) as string[];
    const riderIds = Array.from(new Set(rides.map((r) => r.rider_id).filter(Boolean))) as string[];
    const [partners, riders] = await Promise.all([
      partnerIds.length ? prisma.logisticsPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      riderIds.length ? prisma.rider.findMany({ where: { id: { in: riderIds } }, select: { id: true, name: true, phone: true } }) : Promise.resolve([]),
    ]);
    const partnerName = new Map(partners.map((p) => [p.id, p.name]));
    const riderById = new Map(riders.map((r) => [r.id, r]));

    return NextResponse.json({
      success: true,
      rides: rides.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        patient_name: r.patient_name,
        patient_phone: r.patient_phone,
        pickup_address: r.pickup_address,
        destination_lab: r.destination_lab,
        partner_name: r.partner_id ? partnerName.get(r.partner_id) ?? null : null,
        rider_name: r.rider_id ? riderById.get(r.rider_id)?.name ?? null : null,
        rider_phone: r.rider_id ? riderById.get(r.rider_id)?.phone ?? null : null,
        redeem_by: r.redeem_by,
        created_at: r.created_at,
        assigned_at: r.assigned_at,
        completed_at: r.completed_at,
      })),
    });
  } catch (error) {
    console.error("Lab rides fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load rides" }, { status: 500 });
  }
}
