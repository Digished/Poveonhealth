export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  specialty: z.string().max(120).nullable().optional(),
  hospital: z.string().max(200).nullable().optional(),
  commission_type: z.enum(["percent", "flat"]).optional(),
  commission_value: z.number().min(0).max(1_000_000).optional(),
  bank_name: z.string().max(120).nullable().optional(),
  account_number: z.string().max(40).nullable().optional(),
  account_name: z.string().max(200).nullable().optional(),
  active: z.boolean().optional(),
});

async function ownPro(labId: string, id: string) {
  const p = await prisma.labProfessional.findUnique({ where: { id }, select: { lab_id: true } });
  return p && p.lab_id === labId;
}

/** PATCH /api/lab/professionals/[id] */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ownPro(auth.lab_id, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const professional = await prisma.labProfessional.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ professional: { ...professional, commission_value: Number(professional.commission_value) } });
}

/** DELETE /api/lab/professionals/[id] */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await ownPro(auth.lab_id, params.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.labProfessional.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
