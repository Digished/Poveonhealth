export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  category_label: z.string().max(120).nullable().optional(),
  test_names: z.array(z.string().min(1).max(200)).min(1).max(100).optional(),
  tat_hours: z.number().int().min(0).max(8760).nullable().optional(),
});

async function ownTemplate(labId: string, id: string) {
  const t = await prisma.labTestTemplate.findUnique({ where: { id }, select: { lab_id: true } });
  return t && t.lab_id === labId;
}

/** PATCH /api/lab/templates/[id] */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ownTemplate(auth.lab_id, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const template = await prisma.labTestTemplate.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ template });
}

/** DELETE /api/lab/templates/[id] */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ownTemplate(auth.lab_id, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.labTestTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
