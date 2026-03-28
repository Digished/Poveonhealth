import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

    const marketer = await prisma.marketer.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { pin_hash: true, suspended: true },
    });

    if (!marketer) return NextResponse.json({ hasPin: false, exists: false });
    if (marketer.suspended) return NextResponse.json({ error: "Account suspended." }, { status: 403 });

    return NextResponse.json({ hasPin: !!(marketer.pin_hash), exists: true });
  } catch (err) {
    console.error("[scale/check-pin]", err);
    return NextResponse.json({ error: "Failed to check." }, { status: 500 });
  }
}
