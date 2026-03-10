export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/admin/labs/[id]/members/[memberId] — reassign role
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    if (!UUID_RE.test(params.id) || !UUID_RE.test(params.memberId)) return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });

    const body = await req.json();
    const parsed = z.object({ role_id: z.string().uuid() }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "role_id required" }, { status: 400 });

    const existing = await prisma.labMember.findFirst({ where: { id: params.memberId, lab_id: params.id } });
    if (!existing) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });

    const roleExists = await prisma.labRole.findFirst({
      where: { id: parsed.data.role_id, lab_id: params.id },
      select: { id: true },
    });
    if (!roleExists) return NextResponse.json({ success: false, error: "Role not found for this lab" }, { status: 404 });

    const member = await prisma.labMember.update({
      where: { id: params.memberId },
      data: { role_id: parsed.data.role_id },
      include: { role: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, member });
  } catch (e) {
    console.error("Reassign member error:", e);
    return NextResponse.json({ success: false, error: "Failed to reassign member" }, { status: 500 });
  }
}

// DELETE /api/admin/labs/[id]/members/[memberId] — remove member + delete their auth account
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    if (!UUID_RE.test(params.id) || !UUID_RE.test(params.memberId)) return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });

    const member = await prisma.labMember.findFirst({
      where: { id: params.memberId, lab_id: params.id },
      select: { id: true, user_id: true },
    });
    if (!member) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });

    // Remove LabMember record first
    await prisma.labMember.delete({ where: { id: params.memberId } });

    // Delete the Supabase auth user
    const adminSupabase = createAdminClient();
    await adminSupabase.auth.admin.deleteUser(member.user_id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Remove member error:", e);
    return NextResponse.json({ success: false, error: "Failed to remove member" }, { status: 500 });
  }
}
