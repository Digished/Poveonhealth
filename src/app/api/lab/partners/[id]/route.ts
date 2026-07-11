export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";

const PatchSchema = z.object({
  type: z.enum(["hmo", "hospital", "company"]).optional(),
  name: z.string().min(1).max(200).optional(),
  contact_name: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(100).optional().or(z.literal("")),
  email: z.string().email().max(200).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  is_active: z.boolean().optional(),
});

/** PATCH /api/lab/partners/[id] — edit a partner. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals && !auth.permissions.can_manage_team) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.labPartner.findUnique({ where: { id: params.id }, select: { lab_id: true } });
  if (!existing || existing.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const partner = await prisma.labPartner.update({
    where: { id: params.id },
    data: {
      ...(d.type !== undefined ? { type: d.type } : {}),
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.contact_name !== undefined ? { contact_name: d.contact_name.trim() || null } : {}),
      ...(d.phone !== undefined ? { phone: d.phone.trim() || null } : {}),
      ...(d.email !== undefined ? { email: d.email.trim() || null } : {}),
      ...(d.address !== undefined ? { address: d.address.trim() || null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes.trim() || null } : {}),
      ...(d.is_active !== undefined ? { is_active: d.is_active } : {}),
    },
  });

  return NextResponse.json({ success: true, partner });
}

/** DELETE /api/lab/partners/[id] — remove a partner. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_professionals && !auth.permissions.can_manage_team) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.labPartner.findUnique({ where: { id: params.id }, select: { lab_id: true, name: true, type: true } });
  if (!existing || existing.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Partner not found" }, { status: 404 });

  await prisma.labPartner.delete({ where: { id: params.id } });

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "partner_removed", detail: `${existing.type}: ${existing.name}` });
  }

  return NextResponse.json({ success: true });
}
