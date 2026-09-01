export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PHARMACY_COOKIE } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

export async function POST(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  const token = req.cookies.get(PHARMACY_COOKIE)?.value;
  if (token) await prisma.pharmacySession.delete({ where: { id: token } }).catch(() => {});
  const res = NextResponse.json({ success: true });
  res.cookies.set(PHARMACY_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}
