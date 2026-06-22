export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

const PATIENT_ROLES = ["onboarding_clerk", "nurse", "records"] as const;

/** GET /api/emr/patients?q= — staff list/search of created patients */
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, [...PATIENT_ROLES])) {
      return NextResponse.json({ error: "You do not have patient access." }, { status: 403 });
    }

    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

    const patients = await prisma.hospitalPatient.findMany({
      where: {
        hospital_id: staff.hospital_id,
        ...(q
          ? {
              OR: [
                { full_name: { contains: q, mode: "insensitive" } },
                { hospital_number: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, patients });
  } catch (err) {
    console.error("[emr/patients GET]", err);
    return NextResponse.json({ error: "Failed to load patients." }, { status: 500 });
  }
}
