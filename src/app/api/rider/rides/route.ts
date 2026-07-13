export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRiderAuth } from "@/lib/rider-auth";

/**
 * GET /api/rider/rides — rides assigned to the signed-in rider. Riders only see
 * the patient's first name, phone and pickup location (never the arrival code).
 */
export async function GET(req: NextRequest) {
  const auth = await getRiderAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rides = await prisma.ridePerk.findMany({
    where: { rider_id: auth.rider_id },
    orderBy: [{ status: "asc" }, { created_at: "desc" }],
    take: 200,
  });

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
      assigned_at: r.assigned_at,
      completed_at: r.completed_at,
    })),
  });
}
