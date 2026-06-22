export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

/** GET /api/emr/lab-orders?status=open — laboratory queue */
export async function GET(req: NextRequest) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["lab_tech"])) {
      return NextResponse.json({ error: "You do not have laboratory access." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "open";
    const statuses = status === "all" ? undefined : status === "open" ? ["ordered", "collected"] : [status];

    const orders = await prisma.labOrder.findMany({
      where: {
        patient: { hospital_id: staff.hospital_id },
        ...(statuses ? { status: { in: statuses } } : {}),
      },
      orderBy: { created_at: status === "open" ? "asc" : "desc" },
      take: 100,
      include: {
        tests: { orderBy: { sort_order: "asc" } },
        patient: { select: { full_name: true, hospital_number: true, age: true, sex: true } },
      },
    });

    return NextResponse.json({ success: true, lab_orders: orders });
  } catch (err) {
    console.error("[emr/lab-orders GET]", err);
    return NextResponse.json({ error: "Failed to load lab orders." }, { status: 500 });
  }
}
