import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("patient_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const session = await prisma.patientSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }

    const requests = await prisma.request.findMany({
      where: { patient_email: session.patient_email },
      orderBy: { created_at: "desc" },
      include: { lab: { select: { id: true, name: true, address: true, whatsapp: true, phones: true } } },
    });

    return NextResponse.json({
      success: true,
      patient_email: session.patient_email,
      requests,
    });
  } catch (err) {
    console.error("[patient/me]", err);
    return NextResponse.json({ error: "Failed to load requests." }, { status: 500 });
  }
}
