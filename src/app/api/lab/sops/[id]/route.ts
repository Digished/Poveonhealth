export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

const UpdateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  category: z.string().max(80).optional().or(z.literal("")),
  department: z.string().max(60).optional().or(z.literal("")),
  content: z.string().max(20000).optional().or(z.literal("")),
});

async function ownedSop(auth: { lab_id: string }, id: string) {
  const sop = await prisma.labSop.findUnique({ where: { id }, select: { id: true, lab_id: true, title: true, version: true } });
  if (!sop || sop.lab_id !== auth.lab_id) return null;
  return sop;
}

/** PATCH /api/lab/sops/[id] — edit an SOP (bumps version). Requires can_manage_templates. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sop = await ownedSop(auth, params.id);
  if (!sop) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const data: Record<string, unknown> = { version: { increment: 1 } };
  if (d.title !== undefined) data.title = d.title.trim();
  if (d.category !== undefined) data.category = d.category.trim() || null;
  if (d.department !== undefined) data.department = d.department.trim() || null;
  if (d.content !== undefined) data.content = d.content;

  const updated = await prisma.labSop.update({ where: { id: params.id }, data });
  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "sop_updated", detail: updated.title });
  return NextResponse.json({ sop: updated });
}

/** DELETE /api/lab/sops/[id] — remove an SOP. Requires can_manage_templates. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_templates) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sop = await ownedSop(auth, params.id);
  if (!sop) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.labSop.delete({ where: { id: params.id } });
  if (auth.actor_email) logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "sop_deleted", detail: sop.title });
  return NextResponse.json({ success: true });
}
