export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { ROLE_PERMISSION_KEYS } from "@/lib/lab-roles";

const permsShape = Object.fromEntries(ROLE_PERMISSION_KEYS.map((k) => [k, z.boolean().optional()]));
const CreateSchema = z.object({ name: z.string().min(1).max(60), ...permsShape });

/** GET /api/lab/roles — list roles (with member counts). */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_roles) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const roles = await prisma.labRole.findMany({
    where: { lab_id: auth.lab_id },
    orderBy: { created_at: "asc" },
    include: { _count: { select: { members: true } } },
  });
  return NextResponse.json({ roles, permission_keys: ROLE_PERMISSION_KEYS });
}

/** POST /api/lab/roles — create a role. */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_roles) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  const { name, ...perms } = parsed.data;

  const exists = await prisma.labRole.findFirst({ where: { lab_id: auth.lab_id, name } });
  if (exists) return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });

  const role = await prisma.labRole.create({ data: { lab_id: auth.lab_id, name, ...perms } });
  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "role_created", detail: `Role "${name}"` });
  return NextResponse.json({ role });
}
