import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("doc_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const session = await prisma.doctorSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
    }

    const requests = await prisma.request.findMany({
      where: { doctor_email: session.doctor_email },
      orderBy: { created_at: "desc" },
      include: { lab: { select: { id: true, name: true, address: true, phones: true, logo_url: true, whatsapp: true } } },
    });

    return NextResponse.json({
      success: true,
      doctor_email: session.doctor_email,
      requests,
    });
  } catch (err) {
    console.error("[doc-login/me]", err);
    return NextResponse.json({ error: "Failed to load requests." }, { status: 500 });
  }
}
