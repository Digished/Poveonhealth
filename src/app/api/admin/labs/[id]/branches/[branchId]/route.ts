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
  name:    z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional(),
  phones:  z.array(z.string().min(1)).optional(),
  is_main: z.boolean().optional(),
});

/** PATCH /api/admin/labs/[id]/branches/[branchId] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, branchId } = await params;

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const { is_main, ...rest } = parsed.data;

  if (is_main) {
    await prisma.labBranch.updateMany({ where: { lab_id: id }, data: { is_main: false } });
  }

  const branch = await prisma.labBranch.update({
    where: { id: branchId },
    data: { ...rest, ...(is_main !== undefined ? { is_main } : {}) },
  });
  return NextResponse.json({ success: true, branch });
}

/** DELETE /api/admin/labs/[id]/branches/[branchId] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { branchId } = await params;
  await prisma.labBranch.delete({ where: { id: branchId } });
  return NextResponse.json({ success: true });
}
