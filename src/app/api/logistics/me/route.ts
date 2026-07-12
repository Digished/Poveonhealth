export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLogisticsAuth } from "@/lib/logistics-auth";

/** GET /api/logistics/me — the signed-in partner and their assigned labs. */
export async function GET(req: NextRequest) {
  const auth = await getLogisticsAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const partner = await prisma.logisticsPartner.findUnique({ where: { id: auth.partner_id } });
  if (!partner) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const links = await prisma.logisticsPartnerLab.findMany({ where: { partner_id: partner.id } });
  const labs = await prisma.lab.findMany({
    where: { id: { in: links.map((l) => l.lab_id) } },
    select: { id: true, name: true },
  });

  return NextResponse.json({
    success: true,
    partner: {
      id: partner.id,
      name: partner.name,
      email: partner.email,
      contact_name: partner.contact_name,
      phone: partner.phone,
    },
    labs,
  });
}
