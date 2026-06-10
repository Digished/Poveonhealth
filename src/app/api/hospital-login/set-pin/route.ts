import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";

export async function POST(req: NextRequest) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { pin } = await req.json();
    const trimmedPin = String(pin ?? "").trim();

    if (!/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const pinHash = createHash("sha256").update(trimmedPin).digest("hex");
    await prisma.hospital.update({ where: { id: hospital.id }, data: { pin_hash: pinHash } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[hospital-login/set-pin]", err);
    return NextResponse.json({ error: "Failed to update PIN." }, { status: 500 });
  }
}
