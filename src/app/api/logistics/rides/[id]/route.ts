export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLogisticsAuth } from "@/lib/logistics-auth";
import { notifyRiderAssigned } from "@/lib/rides";

const PatchSchema = z.object({
  action: z.enum(["assign", "unassign", "cancel"]),
  rider_id: z.string().uuid().optional(),
});

/**
 * PATCH /api/logistics/rides/[id]
 * Assign/unassign a rider or cancel a ride. Assigning a rider emails the patient
 * the rider's phone number to call when ready.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLogisticsAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const ride = await prisma.ridePerk.findUnique({ where: { id: params.id } });
  if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });

  // The ride must be for one of this partner's assigned labs.
  const link = await prisma.logisticsPartnerLab.findFirst({
    where: { partner_id: auth.partner_id, lab_id: ride.lab_id },
  });
  if (!link) return NextResponse.json({ error: "This ride is not for your labs." }, { status: 403 });
  // Once another partner has claimed it, it's off-limits.
  if (ride.partner_id && ride.partner_id !== auth.partner_id) {
    return NextResponse.json({ error: "This ride has already been taken by another partner." }, { status: 409 });
  }
  if (ride.status === "completed") {
    return NextResponse.json({ error: "This ride is already completed." }, { status: 409 });
  }

  const { action, rider_id } = parsed.data;

  if (action === "cancel") {
    await prisma.ridePerk.update({ where: { id: ride.id }, data: { status: "cancelled" } });
    return NextResponse.json({ success: true });
  }

  if (action === "unassign") {
    await prisma.ridePerk.update({
      where: { id: ride.id },
      data: { rider_id: null, status: "pending", assigned_at: null },
    });
    return NextResponse.json({ success: true });
  }

  // assign
  if (!rider_id) return NextResponse.json({ error: "A rider is required." }, { status: 400 });
  const rider = await prisma.rider.findFirst({
    where: { id: rider_id, partner_id: auth.partner_id, is_active: true },
  });
  if (!rider) return NextResponse.json({ error: "Rider not found." }, { status: 404 });

  await prisma.ridePerk.update({
    where: { id: ride.id },
    data: {
      partner_id: auth.partner_id,
      rider_id: rider.id,
      status: "assigned",
      assigned_at: new Date(),
    },
  });

  // Email the patient the rider's phone number (best effort).
  notifyRiderAssigned(ride.id).catch(() => {});

  return NextResponse.json({ success: true });
}
