import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("emr_token")?.value;
    if (token) {
      await prisma.hospitalStaffSession.deleteMany({ where: { id: token } }).catch(() => {});
    }
  } catch {
    // best-effort
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set("emr_token", "", { httpOnly: true, path: "/", expires: new Date(0) });
  return res;
}
