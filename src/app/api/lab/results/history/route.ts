export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/results/history?q=&limit=
 * Past (reported) results for the lab, most recent first, for viewing/searching.
 * Optional ?q= matches patient name / request code / phone. Requires
 * can_view_requests.
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 100), 200);

  const results = await prisma.requestResult.findMany({
    where: {
      lab_id: auth.lab_id,
      status: "reported",
      ...(auth.department ? { OR: [{ department: auth.department }, { department: null }] } : {}),
      ...(q
        ? { request: { is: { OR: [
            { patient_name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { patient_phone: { contains: q, mode: "insensitive" } },
          ] } } }
        : {}),
    },
    orderBy: { updated_at: "desc" },
    take: limit,
    select: {
      id: true, department: true, status: true, pdf_url: true, updated_at: true, verified_by: true,
      request: { select: { code: true, patient_name: true, patient_phone: true } },
    },
  });

  return NextResponse.json({ results });
}
