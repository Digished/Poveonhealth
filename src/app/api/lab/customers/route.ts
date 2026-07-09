export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/customers
 * Every customer record for this lab since inception — one row per request,
 * regardless of status (arrived or not). Powers the Customers table and its
 * spreadsheet export. Requires can_view_clients.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    if (!auth.permissions.can_view_clients) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

    const rows = await prisma.request.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        code: true,
        status: true,
        source: true,
        patient_name: true,
        patient_phone: true,
        patient_email: true,
        patient_age: true,
        dob: true,
        sex: true,
        address: true,
        doctor_prefix: true,
        doctor_name: true,
        doctor_email: true,
        doctor_phone: true,
        doctor_hospital: true,
        tests: true,
        diagnosis: true,
        referral_type: true,
        whatsapp_phone: true,
        payment_mode: true,
        is_paid: true,
        created_at: true,
        seen_at: true,
        arrived_at: true,
        attended_at: true,
        completed_at: true,
      },
    });

    const customers = rows.map((r) => ({
      ...r,
      dob: r.dob ? r.dob.toISOString().slice(0, 10) : null,
      // "Attend date" = when the client actually showed up / was checked in.
      attend_date: r.arrived_at ?? r.seen_at ?? null,
      arrived: !!(r.arrived_at ?? r.seen_at),
    }));

    return NextResponse.json({ success: true, customers });
  } catch (error) {
    console.error("Lab customers fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load customers" }, { status: 500 });
  }
}
