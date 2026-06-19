export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { ROLE_PERMISSION_KEYS } from "@/lib/lab-roles";

const permsShape = Object.fromEntries(ROLE_PERMISSION_KEYS.map((k) => [k, z.boolean().optional()]));
const PatchSchema = z.object({ name: z.string().min(1).max(60).optional(), ...permsShape });

async function ownRole(labId: string, id: string) {
  const r = await prisma.labRole.findUnique({ where: { id }, select: { lab_id: true } });
  return r && r.lab_id === labId;
}

/** PATCH /api/lab/roles/[id] — edit name / permissions. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_roles) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ownRole(auth.lab_id, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const role = await prisma.labRole.update({ where: { id: params.id }, data: parsed.data });
  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "role_updated", detail: `Role "${role.name}"` });
  return NextResponse.json({ role });
}

/** DELETE /api/lab/roles/[id] — only if no members are assigned. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_roles) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ownRole(auth.lab_id, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const memberCount = await prisma.labMember.count({ where: { role_id: params.id } });
  if (memberCount > 0) return NextResponse.json({ error: "Reassign members before deleting this role" }, { status: 409 });

  await prisma.labRole.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
