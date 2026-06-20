export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

const ParamSchema = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().max(40).optional().or(z.literal("")),
  reference_range: z.string().max(80).optional().or(z.literal("")),
  group: z.string().max(80).optional().or(z.literal("")),
});

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  department: z.string().max(60).nullable().optional(),
  parameters: z.array(ParamSchema).min(1).max(200).optional(),
  interpretation: z.string().max(2000).nullable().optional(),
});

async function ownTemplate(labId: string, id: string) {
  const t = await prisma.labResultTemplate.findUnique({ where: { id }, select: { lab_id: true } });
  return t && t.lab_id === labId;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ownTemplate(auth.lab_id, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const template = await prisma.labResultTemplate.update({
    where: { id: params.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.department !== undefined ? { department: d.department } : {}),
      ...(d.interpretation !== undefined ? { interpretation: d.interpretation } : {}),
      ...(d.parameters ? { parameters: d.parameters.map((p) => ({ name: p.name, unit: p.unit || "", reference_range: p.reference_range || "", group: p.group || "" })) } : {}),
    },
  });
  return NextResponse.json({ template });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ownTemplate(auth.lab_id, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.labResultTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
