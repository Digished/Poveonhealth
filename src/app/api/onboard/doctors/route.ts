export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * GET /api/onboard/doctors?lab_id=&q=
 * Public typeahead over a lab's referring-doctor pool, for the onboarding
 * doctor picker. Returns only display fields (no contact/bank), plus a flag for
 * whether bank details are on file (so the picker can warn).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const labId = searchParams.get("lab_id") ?? "";
  const q = (searchParams.get("q") ?? "").trim();
  if (!labId) return NextResponse.json({ doctors: [] }, { headers: CORS });

  const rows = await prisma.labProfessional.findMany({
    where: {
      lab_id: labId,
      active: true,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    take: 8,
    orderBy: { name: "asc" },
    select: { id: true, name: true, specialty: true, hospital: true, account_number: true },
  });

  return NextResponse.json(
    {
      doctors: rows.map((r) => ({
        id: r.id,
        name: r.name,
        specialty: r.specialty,
        hospital: r.hospital,
        has_bank: !!r.account_number,
      })),
    },
    { headers: CORS }
  );
}
