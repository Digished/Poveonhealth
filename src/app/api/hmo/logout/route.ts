import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HMO_COOKIE } from "@/lib/hmo/auth";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get(HMO_COOKIE)?.value;
    if (token) {
      await prisma.hmoPatientSession.deleteMany({ where: { id: token } });
    }
  } catch (err) {
    console.error("[hmo/logout]", err);
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(HMO_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
