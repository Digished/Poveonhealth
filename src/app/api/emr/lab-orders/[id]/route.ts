export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

interface ResultInput {
  id: string;
  result_value?: string;
  result_unit?: string;
  reference_range?: string;
  flag?: string;
}

/**
 * PATCH /api/emr/lab-orders/[id]
 * Body: { action: "collect" } | { action: "result", results: ResultInput[] } | { action: "cancel" }
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["lab_tech"])) {
      return NextResponse.json({ error: "You do not have laboratory access." }, { status: 403 });
    }

    const order = await prisma.labOrder.findFirst({
      where: { id: params.id, patient: { hospital_id: staff.hospital_id } },
      select: { id: true },
    });
    if (!order) return NextResponse.json({ error: "Lab order not found." }, { status: 404 });

    const body = await req.json();

    if (body.action === "collect") {
      await prisma.labOrder.update({
        where: { id: params.id },
        data: { status: "collected", collected_by: staff.id, collected_at: new Date() },
      });
    } else if (body.action === "result") {
      const results: ResultInput[] = Array.isArray(body.results) ? body.results : [];
      for (const r of results) {
        if (!r.id) continue;
        await prisma.labOrderTest.updateMany({
          where: { id: r.id, lab_order_id: params.id },
          data: {
            result_value: r.result_value ?? null,
            result_unit: r.result_unit ?? null,
            reference_range: r.reference_range ?? null,
            flag: r.flag ?? null,
            status: "resulted",
          },
        });
      }
      await prisma.labOrder.update({
        where: { id: params.id },
        data: { status: "resulted", resulted_by: staff.id, resulted_at: new Date() },
      });
    } else if (body.action === "cancel") {
      await prisma.labOrder.update({ where: { id: params.id }, data: { status: "cancelled" } });
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    const updated = await prisma.labOrder.findUnique({
      where: { id: params.id },
      include: { tests: { orderBy: { sort_order: "asc" } } },
    });
    return NextResponse.json({ success: true, lab_order: updated });
  } catch (err) {
    console.error("[emr/lab-orders/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update lab order." }, { status: 500 });
  }
}
