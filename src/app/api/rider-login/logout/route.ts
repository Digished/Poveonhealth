import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RIDER_COOKIE } from "@/lib/rider-auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(RIDER_COOKIE)?.value;
  if (token) {
    await prisma.riderSession.delete({ where: { id: token } }).catch(() => {});
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(RIDER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
