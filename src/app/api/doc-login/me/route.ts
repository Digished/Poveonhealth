import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

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

    const [requests, profile] = await Promise.all([
      prisma.request.findMany({
        where: { doctor_email: session.doctor_email },
        orderBy: { created_at: "desc" },
        include: { lab: { select: { id: true, name: true, address: true, phones: true, logo_url: true, whatsapp: true } } },
      }),
      prisma.doctorProfile.findUnique({ where: { email: session.doctor_email } }),
    ]);

    return NextResponse.json({
      success: true,
      doctor_email: session.doctor_email,
      requests,
      profile: profile ? {
        prefix: profile.prefix ?? null,
        full_name: profile.full_name ?? null,
        phone: profile.phone ?? null,
        hospitals: profile.hospitals ?? [],
        bank_name: profile.bank_name ?? null,
        account_number: profile.account_number ?? null,
        account_name: profile.account_name ?? null,
      } : null,
    });
  } catch (err) {
    console.error("[doc-login/me]", err);
    return NextResponse.json({ error: "Failed to load requests." }, { status: 500 });
  }
}
