import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Cap the list the dashboard renders — older requests are rarely opened and
 *  an unbounded fetch was the slowest part of loading the portal. */
const MAX_REQUESTS = 300;

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
        take: MAX_REQUESTS,
        // Only the columns the dashboard actually renders — the row carries a
        // lot of lab-side workflow state the doctor never sees.
        select: {
          id: true, code: true, patient_name: true, dob: true, patient_age: true,
          sex: true, address: true, patient_email: true, patient_phone: true,
          tests: true, diagnosis: true, schedule: true, status: true,
          result_link: true, result_note: true, result_file_urls: true,
          created_at: true, seen_at: true, completed_at: true,
          lab: { select: { id: true, name: true, address: true, phones: true, logo_url: true, whatsapp: true } },
        },
      }),
      prisma.doctorProfile.findUnique({
        where: { email: session.doctor_email },
        select: {
          prefix: true, full_name: true, phone: true, hospitals: true,
          bank_name: true, account_number: true, account_name: true,
          avatar_url: true,
        },
      }),
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
