import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("scale_token")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const session = await prisma.marketerSession.findUnique({
      where: { id: token },
      include: { marketer: true },
    });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Session expired." }, { status: 401 });
    }

    const { pin } = await req.json();
    const trimmedPin = String(pin ?? "").trim();
    if (!/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be 4 digits." }, { status: 400 });
    }

    const pinHash = createHash("sha256").update(trimmedPin).digest("hex");
    await prisma.marketer.update({
      where: { id: session.marketer_id },
      data: { pin_hash: pinHash },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[scale/set-pin]", err);
    return NextResponse.json({ error: "Failed to set PIN." }, { status: 500 });
  }
}
