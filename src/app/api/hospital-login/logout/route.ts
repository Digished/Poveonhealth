import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("hospital_token")?.value;

  if (token) {
    await prisma.hospitalSession.delete({ where: { id: token } }).catch(() => {});
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set("hospital_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
