import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LOGISTICS_COOKIE } from "@/lib/logistics-auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(LOGISTICS_COOKIE)?.value;
  if (token) {
    await prisma.logisticsSession.delete({ where: { id: token } }).catch(() => {});
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(LOGISTICS_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
