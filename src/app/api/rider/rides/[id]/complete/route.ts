export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getRiderAuth } from "@/lib/rider-auth";

const Schema = z.object({ code: z.string().min(3).max(30) });

/**
 * POST /api/rider/rides/[id]/complete
 * The rider ends the trip by entering the patient's arrival code. The patient is
 * told not to share it until they have reached the lab, so a correct code
 * confirms arrival. Marks the ride completed.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRiderAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "An arrival code is required." }, { status: 400 });

  const ride = await prisma.ridePerk.findFirst({
    where: { id: params.id, rider_id: auth.rider_id },
  });
  if (!ride) return NextResponse.json({ error: "Ride not found." }, { status: 404 });
  if (ride.status === "completed") {
    return NextResponse.json({ error: "This ride is already completed." }, { status: 409 });
  }

  const supplied = parsed.data.code.trim().toUpperCase();
  const expected = ride.code.trim().toUpperCase();
  // Accept the code with or without the "RIDE-" prefix.
  const matches = supplied === expected || `RIDE-${supplied}` === expected || supplied === expected.replace(/^RIDE-/, "");
  if (!matches) {
    return NextResponse.json({ error: "Incorrect arrival code. Ask the patient to confirm it once they've arrived." }, { status: 400 });
  }

  await prisma.ridePerk.update({
    where: { id: ride.id },
    data: { status: "completed", completed_at: new Date() },
  });

  return NextResponse.json({ success: true });
}
