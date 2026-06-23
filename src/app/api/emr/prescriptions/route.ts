export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

/** GET /api/emr/prescriptions?status=pending — pharmacy queue */
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["pharmacist"])) {
      return NextResponse.json({ error: "You do not have pharmacy access." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "pending";
    const statuses = status === "all" ? undefined : status === "pending"
      ? ["pending", "partially_dispensed"]
      : [status];

    const prescriptions = await prisma.prescription.findMany({
      where: {
        patient: { hospital_id: staff.hospital_id },
        ...(statuses ? { status: { in: statuses } } : {}),
      },
      orderBy: { created_at: status === "pending" ? "asc" : "desc" },
      take: 100,
      include: {
        items: { orderBy: { sort_order: "asc" } },
        patient: { select: { full_name: true, hospital_number: true, age: true, sex: true, allergies: true } },
      },
    });

    return NextResponse.json({ success: true, prescriptions });
  } catch (err) {
    console.error("[emr/prescriptions GET]", err);
    return NextResponse.json({ error: "Failed to load prescriptions." }, { status: 500 });
  }
}
