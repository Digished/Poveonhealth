export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** PATCH /api/admin/labs/[id]/branches/[branchId] — toggle is_main */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, branchId } = await params;
  const body = await req.json();
  const is_main: boolean = body.is_main ?? false;

  if (is_main) {
    await prisma.labBranch.updateMany({ where: { lab_id: id }, data: { is_main: false } });
  }

  const branch = await prisma.labBranch.update({
    where: { id: branchId },
    data: { is_main },
    include: { branch_lab: { select: { id: true, name: true, address: true } } },
  });
  return NextResponse.json({ success: true, branch });
}

/** DELETE /api/admin/labs/[id]/branches/[branchId] — unlink a branch */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { branchId } = await params;
  await prisma.labBranch.delete({ where: { id: branchId } });
  return NextResponse.json({ success: true });
}
