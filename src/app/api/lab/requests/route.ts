export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import { jsonWithEtag, makeEtag, notModified } from "@/lib/http-cache";

// Exactly the columns the dashboard's LabRequest type carries. Selecting them
// explicitly keeps the heavy, unused ones (test_breakdown, result_file_urls,
// ambulance_notes, …) out of a payload that is polled every 30 seconds.
const REQUEST_SELECT = {
  id: true,
  code: true,
  lab_id: true,
  patient_name: true,
  dob: true,
  patient_age: true,
  sex: true,
  address: true,
  patient_email: true,
  patient_phone: true,
  doctor_prefix: true,
  doctor_name: true,
  doctor_email: true,
  doctor_phone: true,
  doctor_hospital: true,
  doctor_bank_name: true,
  doctor_account_number: true,
  doctor_account_name: true,
  schedule: true,
  diagnosis: true,
  tests: true,
  status: true,
  created_at: true,
  updated_at: true,
  seen_at: true,
  completed_at: true,
  test_image_url: true,
  is_critical: true,
  needs_ambulance: true,
  has_free_ride: true,
  fast_mode: true,
  raw_input: true,
  source: true,
  current_stage: true,
} as const;

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 5000;

/**
 * GET /api/lab/requests?status=&page=&limit=
 *
 * The lab's requests, newest first, plus exact per-status counts so the
 * dashboard's totals stay right even though the list itself is capped. The cap
 * is what keeps a 30-second poll from re-sending the lab's whole history every
 * time; integrators pulling more can page through with `page` and `limit`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    if (!auth.permissions.can_view_requests) return NextResponse.json({ success: false, error: "Your role does not permit viewing requests" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;
    const pageParam = Number(searchParams.get("page"));
    const page = Number.isFinite(pageParam) && pageParam > 1 ? Math.floor(pageParam) : 1;
    const statusParam = searchParams.get("status");
    const status = statusParam === "incoming" || statusParam === "seen" || statusParam === "done" ? statusParam : null;

    const where = { lab_id: auth.lab_id, ...(status ? { status } : {}) };

    // Cheap version probe first — a poll that finds nothing new stops here and
    // never reads a single request row.
    const [byStatus, freshness] = await Promise.all([
      prisma.request.groupBy({ by: ["status"], where: { lab_id: auth.lab_id }, _count: { _all: true } }),
      prisma.request.aggregate({ where: { lab_id: auth.lab_id }, _max: { updated_at: true } }),
    ]);

    const counts = { incoming: 0, seen: 0, done: 0, total: 0 };
    for (const row of byStatus) {
      const n = Number(row._count._all);
      counts.total += n;
      const key = String(row.status);
      if (key === "incoming" || key === "seen" || key === "done") counts[key] = n;
    }

    const etag = makeEtag(["lab-requests", auth.lab_id, status, page, limit, counts.total, counts.incoming, counts.seen, counts.done, freshness._max.updated_at]);
    const cached = notModified(request, etag);
    if (cached) return cached;

    const requests = await prisma.request.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: REQUEST_SELECT,
    });

    const matching = status ? counts[status] : counts.total;
    return jsonWithEtag(
      { success: true, requests, counts, page, limit, total: matching, truncated: matching > (page - 1) * limit + requests.length },
      etag
    );
  } catch (error) {
    console.error("Lab requests fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load requests" }, { status: 500 });
  }
}
