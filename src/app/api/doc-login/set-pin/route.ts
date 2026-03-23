import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("doc_token")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const session = await prisma.doctorSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Session expired." }, { status: 401 });
    }

    const { pin } = await req.json();
    const trimmedPin = String(pin ?? "").trim();

    // Allow empty pin string to clear the PIN
    if (trimmedPin !== "" && !/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const pinHash = trimmedPin ? createHash("sha256").update(trimmedPin).digest("hex") : null;

    await prisma.doctorProfile.upsert({
      where: { email: session.doctor_email },
      create: { email: session.doctor_email, pin_hash: pinHash },
      update: { pin_hash: pinHash },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/set-pin]", err);
    return NextResponse.json({ error: "Failed to update PIN." }, { status: 500 });
  }
}
