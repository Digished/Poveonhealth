export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/schedule?from=ISO&to=ISO
 * Returns paid requests with a structured appointment time (`scheduled_at`)
 * inside the range — the radiology/imaging schedule. Lets staff browse the
 * calendar and find which scans are booked on a given day.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {
    lab_id: auth.lab_id,
    scheduled_at: {
      not: null,
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    },
  };

  const requests = await prisma.request.findMany({
    where,
    select: {
      id: true, code: true, patient_name: true, patient_phone: true,
      tests: true, scheduled_at: true, current_stage: true, status: true, source: true,
    },
    orderBy: { scheduled_at: "asc" },
  });

  return NextResponse.json({
    requests: requests.map((r) => ({ ...r, scheduled_at: r.scheduled_at?.toISOString() ?? null })),
  });
}
