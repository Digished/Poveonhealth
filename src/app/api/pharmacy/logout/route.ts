export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PHARMACY_COOKIE } from "@/lib/consult";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PHARMACY_COOKIE)?.value;
  if (token) await prisma.pharmacySession.delete({ where: { id: token } }).catch(() => {});
  const res = NextResponse.json({ success: true });
  res.cookies.set(PHARMACY_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}
