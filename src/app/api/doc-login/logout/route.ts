import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("doc_token")?.value;

  if (token) {
    // Delete session from DB (best effort)
    await prisma.doctorSession.delete({ where: { id: token } }).catch(() => {});
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set("doc_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
