export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/admin/labs/[id]/partners — a lab's partnered HMOs / hospitals / companies (admin). */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });

  const partners = await prisma.labPartner.findMany({
    where: { lab_id: params.id },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ success: true, partners });
}
