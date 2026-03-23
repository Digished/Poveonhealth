import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

    const profile = await prisma.patientProfile.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { pin_hash: true },
    });

    return NextResponse.json({ hasPin: !!(profile?.pin_hash) });
  } catch (err) {
    console.error("[patient/check-pin]", err);
    return NextResponse.json({ error: "Failed to check." }, { status: 500 });
  }
}
