export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const PatchSchema = z.object({
  // Poveon sets the cost of each ride manually — this is what we pay the partner.
  cost: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  is_paid_to_partner: z.boolean().optional(),
  status: z.enum(["pending", "assigned", "completed", "cancelled"]).optional(),
});

/** PATCH /api/admin/rides/[id] — set the manual cost, mark paid, or cancel. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if ("cost" in parsed.data) data.cost = parsed.data.cost;
  if ("is_paid_to_partner" in parsed.data) data.is_paid_to_partner = parsed.data.is_paid_to_partner;
  if ("status" in parsed.data) data.status = parsed.data.status;

  const ride = await prisma.ridePerk.update({ where: { id: params.id }, data }).catch(() => null);
  if (!ride) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true, ride: { ...ride, cost: ride.cost != null ? Number(ride.cost) : null } });
}
