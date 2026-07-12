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
  is_active: z.boolean().optional(),
  remaining_uses: z.coerce.number().int().min(0).max(100).optional(),
  note: z.string().max(300).optional(),
});

/** PATCH /api/admin/perks/[id] — toggle active, adjust remaining uses, edit note. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const perk = await prisma.doctorPerk.update({
    where: { id: params.id },
    data: parsed.data,
  }).catch(() => null);
  if (!perk) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true, perk });
}

/** DELETE /api/admin/perks/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.doctorPerk.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ success: true });
}
