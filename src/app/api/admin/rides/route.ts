export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * GET /api/admin/rides — every redeemed free ride with partner/rider labels and
 * cost/payment tracking, plus a small summary for the dashboard header.
 */
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rides = await prisma.ridePerk.findMany({ orderBy: { created_at: "desc" }, take: 500 });

  const partnerIds = Array.from(new Set(rides.map((r) => r.partner_id).filter(Boolean))) as string[];
  const riderIds = Array.from(new Set(rides.map((r) => r.rider_id).filter(Boolean))) as string[];
  const [partners, riders] = await Promise.all([
    partnerIds.length ? prisma.logisticsPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    riderIds.length ? prisma.rider.findMany({ where: { id: { in: riderIds } }, select: { id: true, name: true, phone: true } }) : Promise.resolve([]),
  ]);
  const partnerName = new Map(partners.map((p) => [p.id, p.name]));
  const riderById = new Map(riders.map((r) => [r.id, r]));

  let totalCost = 0;
  let unpaidCost = 0;
  for (const r of rides) {
    const c = r.cost ? Number(r.cost) : 0;
    totalCost += c;
    if (!r.is_paid_to_partner) unpaidCost += c;
  }

  return NextResponse.json({
    success: true,
    summary: {
      total: rides.length,
      pending: rides.filter((r) => r.status === "pending").length,
      assigned: rides.filter((r) => r.status === "assigned").length,
      completed: rides.filter((r) => r.status === "completed").length,
      total_cost: totalCost,
      unpaid_cost: unpaidCost,
    },
    rides: rides.map((r) => ({
      ...r,
      cost: r.cost != null ? Number(r.cost) : null,
      partner_name: r.partner_id ? partnerName.get(r.partner_id) ?? null : null,
      rider_name: r.rider_id ? riderById.get(r.rider_id)?.name ?? null : null,
      rider_phone: r.rider_id ? riderById.get(r.rider_id)?.phone ?? null : null,
    })),
  });
}
