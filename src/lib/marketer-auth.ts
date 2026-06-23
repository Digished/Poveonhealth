import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type AuthedMarketer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  code: string;
  suspended: boolean;
  weekly_target: number | null;
};

/**
 * Validates the scale_token marketer session cookie and returns the marketer,
 * or null if not authenticated / session expired / suspended.
 * Mirrors the inline check in src/app/api/scale/dashboard/route.ts.
 */
export async function getMarketerFromRequest(req: NextRequest): Promise<AuthedMarketer | null> {
  const token = req.cookies.get("scale_token")?.value;
  if (!token) return null;

  const session = await prisma.marketerSession.findUnique({
    where: { id: token },
    include: { marketer: true },
  });
  if (!session || session.expires_at < new Date()) return null;

  const m = session.marketer;
  if (!m || m.suspended) return null;

  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    code: m.code,
    suspended: m.suspended,
    weekly_target: m.weekly_target ?? null,
  };
}
