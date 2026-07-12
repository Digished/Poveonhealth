import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const RIDER_COOKIE = "rider_token";

export interface RiderAuth {
  rider_id: string;
  partner_id: string;
}

/**
 * Resolve the rider session from the request cookie.
 * Returns null if unauthenticated or the session has expired.
 */
export async function getRiderAuth(req: NextRequest): Promise<RiderAuth | null> {
  const token = req.cookies.get(RIDER_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.riderSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;

  const rider = await prisma.rider.findUnique({
    where: { id: session.rider_id },
    select: { id: true, partner_id: true, is_active: true },
  });
  if (!rider || !rider.is_active) return null;

  return { rider_id: rider.id, partner_id: rider.partner_id };
}
