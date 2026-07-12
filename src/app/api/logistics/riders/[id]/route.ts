export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLogisticsAuth } from "@/lib/logistics-auth";

const PatchSchema = z.object({ is_active: z.boolean() });

/** PATCH /api/logistics/riders/[id] — activate/deactivate a rider. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLogisticsAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const rider = await prisma.rider.findFirst({ where: { id: params.id, partner_id: auth.partner_id } });
  if (!rider) return NextResponse.json({ error: "Rider not found." }, { status: 404 });

  await prisma.rider.update({ where: { id: rider.id }, data: { is_active: parsed.data.is_active } });
  return NextResponse.json({ success: true });
}

/** DELETE /api/logistics/riders/[id] */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLogisticsAuth(req);
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rider = await prisma.rider.findFirst({ where: { id: params.id, partner_id: auth.partner_id } });
  if (!rider) return NextResponse.json({ error: "Rider not found." }, { status: 404 });

  await prisma.riderSession.deleteMany({ where: { rider_id: rider.id } }).catch(() => {});
  await prisma.rider.delete({ where: { id: rider.id } }).catch(() => {});
  return NextResponse.json({ success: true });
}
