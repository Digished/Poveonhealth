export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest } from "@/lib/emr-auth";

/** GET /api/emr/patient-lookup?q=... — staff search for an existing patient */
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (!q) return NextResponse.json({ success: true, patients: [] });

    const patients = await prisma.hospitalPatient.findMany({
      where: {
        hospital_id: staff.hospital_id,
        OR: [
          { full_name: { contains: q, mode: "insensitive" } },
          { hospital_number: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      orderBy: { created_at: "desc" },
      take: 12,
      select: { id: true, full_name: true, hospital_number: true, age: true, sex: true, phone: true },
    });

    return NextResponse.json({ success: true, patients });
  } catch (err) {
    console.error("[emr/patient-lookup]", err);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}
