export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

const PatchSchema = z.object({ role_id: z.string().uuid() });

/**
 * PATCH /api/lab/team/[memberId]
 * Reassign a team member's role. Gated by can_manage_roles (owners via FULL_PERMISSIONS).
 */
export async function PATCH(request: NextRequest, { params }: { params: { memberId: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_roles) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const member = await prisma.labMember.findUnique({ where: { id: params.memberId }, select: { lab_id: true, email: true } });
  if (!member || member.lab_id !== auth.lab_id) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const role = await prisma.labRole.findUnique({ where: { id: parsed.data.role_id }, select: { lab_id: true, name: true } });
  if (!role || role.lab_id !== auth.lab_id) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  await prisma.labMember.update({ where: { id: params.memberId }, data: { role_id: parsed.data.role_id } });

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "member_role_changed", detail: `${member.email ?? "member"} → ${role.name}` });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/lab/team/[memberId]
 * Remove a team member and delete their login. Gated by can_manage_team
 * (the lab owner has it via FULL_PERMISSIONS).
 */
export async function DELETE(request: NextRequest, { params }: { params: { memberId: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const member = await prisma.labMember.findUnique({ where: { id: params.memberId }, select: { id: true, lab_id: true, user_id: true, email: true } });
  if (!member || member.lab_id !== auth.lab_id) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  await prisma.labMember.delete({ where: { id: params.memberId } });

  // Remove the Supabase login too (non-fatal if it fails).
  try {
    await createAdminClient().auth.admin.deleteUser(member.user_id);
  } catch (e) {
    console.error("[lab-team delete] auth user delete failed:", e);
  }

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "member_removed", detail: member.email ?? "member" });
  }

  return NextResponse.json({ success: true });
}
