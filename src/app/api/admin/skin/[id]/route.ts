export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const PatchSchema = z.object({
  status: z.enum(["new", "in_review", "responded", "closed"]).optional(),
  admin_note: z.string().max(4000).optional().nullable(),
});

/** PATCH /api/admin/skin/[id] — update consult status / internal note */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    if (parsed.data.status === "responded") data.responded_at = new Date();
  }
  if (parsed.data.admin_note !== undefined) data.admin_note = parsed.data.admin_note || null;

  const consult = await prisma.skinConsult.update({ where: { id }, data });
  return NextResponse.json({ success: true, consult });
}

/** DELETE /api/admin/skin/[id] — permanently remove a consultation */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const existing = await prisma.skinConsult.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Consultation not found." }, { status: 404 });

  await prisma.skinConsult.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
