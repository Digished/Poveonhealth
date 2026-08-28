export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONSULT_COOKIE } from "@/lib/consult";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(CONSULT_COOKIE)?.value;
  if (token) {
    await prisma.consultPatientSession.delete({ where: { id: token } }).catch(() => {});
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(CONSULT_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}
