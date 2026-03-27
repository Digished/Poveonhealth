import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  try {
    const token = req.cookies.get("doc_token")?.value;
    if (!token) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const session = await prisma.doctorSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Session expired." }, { status: 401 });
    }

    const body = await req.json();
    const { prefix, full_name, phone, hospitals } = body;

    if (!full_name?.trim()) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }

    await prisma.doctorProfile.upsert({
      where: { email: session.doctor_email },
      create: {
        email: session.doctor_email,
        prefix: prefix ?? null,
        full_name: full_name.trim(),
        phone: phone?.trim() || null,
        hospitals: Array.isArray(hospitals) ? hospitals.filter(Boolean) : [],
      },
      update: {
        prefix: prefix ?? null,
        full_name: full_name.trim(),
        phone: phone?.trim() || null,
        hospitals: Array.isArray(hospitals) ? hospitals.filter(Boolean) : [],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/profile]", err);
    return NextResponse.json({ error: "Failed to save profile." }, { status: 500 });
  }
}
