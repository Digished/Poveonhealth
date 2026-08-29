import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Cap the list the dashboard renders — an unbounded fetch of every column was
 *  the slowest part of loading the portal. */
const MAX_REQUESTS = 200;

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
      take: MAX_REQUESTS,
      // Only the columns the dashboard renders — the row carries a lot of
      // lab-side workflow state the patient never sees.
      select: {
        id: true, code: true, patient_name: true, status: true, tests: true,
        schedule: true, diagnosis: true, test_image_url: true,
        result_link: true, result_note: true, result_file_urls: true,
        created_at: true, seen_at: true, completed_at: true,
        lab: { select: { id: true, name: true, address: true, whatsapp: true, phones: true } },
      },
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
