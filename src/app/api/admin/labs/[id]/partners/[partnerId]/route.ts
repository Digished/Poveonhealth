export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { logLabActivity } from "@/lib/lab-activity";

/** DELETE /api/admin/labs/[id]/partners/[partnerId] — remove a partner on behalf of a lab (admin). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; partnerId: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

  const partner = await prisma.labPartner.findFirst({
    where: { id: params.partnerId, lab_id: params.id },
    select: { id: true, type: true, name: true },
  });
  if (!partner) return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });

  await prisma.labPartner.delete({ where: { id: partner.id } });

  logLabActivity({
    lab_id: params.id,
    actor_email: admin.email ?? "admin@poveon.com",
    actor_role: "poveon_admin",
    action: "partner_removed",
    detail: `${partner.type}: ${partner.name} (by Poveon admin)`,
  });

  return NextResponse.json({ success: true });
}
