export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePhones } from "@/lib/phones";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/onboard/queue-status?code=XXXX
 * Public live status for a client's queue-status page (the request code is
 * the shared secret). Returns the journey stage, the client's stable ticket
 * number, and their live position — how many people are still ahead of them
 * in the lab's queue right now.
 */
export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ success: false, error: "Code required" }, { status: 400, headers: CORS_HEADERS });

  const req = await prisma.request.findUnique({
    where: { code },
    select: {
      id: true,
      lab_id: true,
      code: true,
      patient_name: true,
      status: true,
      source: true,
      is_paid: true,
      created_at: true,
      queue_confirmed_at: true,
      queue_number: true,
      attended_at: true,
      lab: { select: { name: true, address: true, logo_url: true, phones: true, description: true } },
    },
  });
  if (!req || req.queue_confirmed_at == null) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404, headers: CORS_HEADERS });
  }

  // People still ahead: joined the queue earlier, not yet attended, not done.
  let ahead: number | null = null;
  if (!req.attended_at && req.status !== "done") {
    ahead = await prisma.request.count({
      where: {
        lab_id: req.lab_id,
        attended_at: null,
        status: { not: "done" },
        queue_confirmed_at: { lt: req.queue_confirmed_at },
      },
    });
  }

  const stage = req.attended_at || req.status === "done" ? "attended" : req.is_paid ? "paid" : "waiting";

  return NextResponse.json(
    {
      success: true,
      code: req.code,
      first_name: (req.patient_name ?? "").split(/\s+/)[0] || null,
      stage, // waiting | paid | attended
      queue_number: req.queue_number,
      ahead, // null once attended
      position: ahead != null ? ahead + 1 : null,
      lab: {
        name: req.lab.name,
        address: req.lab.address,
        logo_url: req.lab.logo_url,
        description: req.lab.description,
        phones: parsePhones(req.lab.phones),
      },
    },
    { headers: CORS_HEADERS }
  );
}
