export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStaffFromRequest, hasRole } from "@/lib/emr-auth";

/**
 * PATCH /api/emr/prescriptions/[id]
 * Body: { status?: "dispensed"|"cancelled", item_id?, item_status? }
 * Mark the whole script dispensed/cancelled, or toggle a single item.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const staff = await getStaffFromRequest(req);
    if (!staff) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!hasRole(staff, ["pharmacist"])) {
      return NextResponse.json({ error: "You do not have pharmacy access." }, { status: 403 });
    }

    const prescription = await prisma.prescription.findFirst({
      where: { id: params.id, patient: { hospital_id: staff.hospital_id } },
      select: { id: true },
    });
    if (!prescription) return NextResponse.json({ error: "Prescription not found." }, { status: 404 });

    const body = await req.json();

    if (body.item_id && body.item_status) {
      await prisma.prescriptionItem.updateMany({
        where: { id: body.item_id, prescription_id: params.id },
        data: { status: body.item_status },
      });
    }

    if (body.status === "dispensed" || body.status === "cancelled") {
      await prisma.prescription.update({
        where: { id: params.id },
        data: {
          status: body.status,
          ...(body.status === "dispensed" ? { dispensed_by: staff.id, dispensed_at: new Date() } : {}),
        },
      });
      if (body.status === "dispensed") {
        await prisma.prescriptionItem.updateMany({
          where: { prescription_id: params.id, status: "pending" },
          data: { status: "dispensed" },
        });
      }
    }

    const updated = await prisma.prescription.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { sort_order: "asc" } } },
    });
    return NextResponse.json({ success: true, prescription: updated });
  } catch (err) {
    console.error("[emr/prescriptions/[id] PATCH]", err);
    return NextResponse.json({ error: "Failed to update prescription." }, { status: 500 });
  }
}
