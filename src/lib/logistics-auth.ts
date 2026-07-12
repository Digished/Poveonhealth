import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const LOGISTICS_COOKIE = "logi_token";

export interface LogisticsAuth {
  partner_id: string;
}

/**
 * Resolve the logistics-partner session from the request cookie.
 * Returns null if unauthenticated or the session has expired.
 */
export async function getLogisticsAuth(req: NextRequest): Promise<LogisticsAuth | null> {
  const token = req.cookies.get(LOGISTICS_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.logisticsSession.findUnique({ where: { id: token } });
  if (!session || session.expires_at < new Date()) return null;

  const partner = await prisma.logisticsPartner.findUnique({
    where: { id: session.partner_id },
    select: { id: true, is_active: true },
  });
  if (!partner || !partner.is_active) return null;

  return { partner_id: partner.id };
}
