import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("scale_token")?.value;
  if (token) {
    await prisma.marketerSession.deleteMany({ where: { id: token } }).catch(() => {});
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set("scale_token", "", { maxAge: 0, path: "/" });
  return res;
}
