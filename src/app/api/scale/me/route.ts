import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("scale_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const session = await prisma.marketerSession.findUnique({
      where: { id: token },
      include: { marketer: true },
    });

    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    return NextResponse.json({ success: true, marketer: session.marketer });
  } catch (err) {
    console.error("[scale/me]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
