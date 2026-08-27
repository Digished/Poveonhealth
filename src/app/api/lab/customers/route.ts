export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { jsonWithEtag, makeEtag, notModified } from "@/lib/http-cache";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 20000;

/**
 * GET /api/lab/customers
 * One row per request, newest first — powers the Customers table and its
 * spreadsheet export. Requires can_view_clients.
 *
 * The table polls this every 10–30s, so it returns a recent window by default
 * (`?limit=`, capped) and answers an unchanged poll with 304. The CSV export
 * asks for the whole history with `?all=1`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    // Powers both the Customers table (clients permission) and Analytics.
    if (!auth.permissions.can_view_clients && !auth.permissions.can_view_analytics) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const wantsAll = searchParams.get("all") === "1";
    const limitParam = Number(searchParams.get("limit"));
    const limit = wantsAll
      ? MAX_LIMIT
      : Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

    // Version probe — cheap enough that an unchanged poll costs a few bytes.
    const freshness = await prisma.request.aggregate({
      where: { lab_id: auth.lab_id },
      _count: { _all: true },
      _max: { updated_at: true },
    });
    const etag = makeEtag(["lab-customers", auth.lab_id, limit, freshness._count._all, freshness._max.updated_at]);
    const cached = notModified(request, etag);
    if (cached) return cached;

    const rows = await prisma.request.findMany({
      where: { lab_id: auth.lab_id },
      orderBy: { created_at: "desc" },
      take: limit,
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
        policy_number: true,
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
      // "Arrived" strictly means staff pressed the onboarding "Client has
      // arrived" button — a revealed/entered code does not imply the client
      // physically showed up.
      attend_date: r.arrived_at ?? null,
      arrived: !!r.arrived_at,
    }));

    return jsonWithEtag({
      success: true,
      customers,
      total: freshness._count._all,
      truncated: freshness._count._all > customers.length,
    }, etag);
  } catch (error) {
    console.error("Lab customers fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load customers" }, { status: 500 });
  }
}
