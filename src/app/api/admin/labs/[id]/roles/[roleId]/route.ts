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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PatchRoleSchema = z.object({
  name:                z.string().min(1).max(60).optional(),
  can_view_requests:   z.boolean().optional(),
  can_mark_seen:       z.boolean().optional(),
  can_mark_done:       z.boolean().optional(),
  can_send_results:    z.boolean().optional(),
  can_manage_team:     z.boolean().optional(),
  can_manage_api_keys: z.boolean().optional(),
  can_view_referrals:  z.boolean().optional(),
  can_view_clients:    z.boolean().optional(),
  can_view_analytics:  z.boolean().optional(),
});

// PATCH /api/admin/labs/[id]/roles/[roleId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; roleId: string } }
) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    if (!UUID_RE.test(params.id) || !UUID_RE.test(params.roleId)) return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });

    const existing = await prisma.labRole.findFirst({ where: { id: params.roleId, lab_id: params.id } });
    if (!existing) return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });

    const body = await req.json();
    const parsed = PatchRoleSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

    const role = await prisma.labRole.update({
      where: { id: params.roleId },
      data: parsed.data,
    });

    return NextResponse.json({ success: true, role });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ success: false, error: "A role with that name already exists" }, { status: 409 });
    }
    console.error("Update role error:", e);
    return NextResponse.json({ success: false, error: "Failed to update role" }, { status: 500 });
  }
}

// DELETE /api/admin/labs/[id]/roles/[roleId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; roleId: string } }
) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    if (!UUID_RE.test(params.id) || !UUID_RE.test(params.roleId)) return NextResponse.json({ success: false, error: "Invalid ID" }, { status: 400 });

    const existing = await prisma.labRole.findFirst({ where: { id: params.roleId, lab_id: params.id } });
    if (!existing) return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });

    // Block deletion if members are assigned to this role
    const memberCount = await prisma.labMember.count({ where: { role_id: params.roleId } });
    if (memberCount > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete: ${memberCount} member(s) are assigned to this role. Reassign them first.` },
        { status: 409 }
      );
    }

    await prisma.labRole.delete({ where: { id: params.roleId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Delete role error:", e);
    return NextResponse.json({ success: false, error: "Failed to delete role" }, { status: 500 });
  }
}
