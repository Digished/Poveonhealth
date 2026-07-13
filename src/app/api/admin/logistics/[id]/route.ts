export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const PatchSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  contact_name: z.string().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
  // Full replacement of the partner's lab assignments.
  lab_ids: z.array(z.string().uuid()).optional(),
});

/** PATCH /api/admin/logistics/[id] — edit details, toggle active, reassign labs. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const { lab_ids, ...fields } = parsed.data;

  const partner = await prisma.logisticsPartner.findUnique({ where: { id: params.id } });
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (Object.keys(fields).length) {
    await prisma.logisticsPartner.update({ where: { id: params.id }, data: fields });
  }

  // Reconcile lab assignments to exactly `lab_ids` when provided.
  if (lab_ids) {
    await prisma.logisticsPartnerLab.deleteMany({
      where: { partner_id: params.id, lab_id: { notIn: lab_ids.length ? lab_ids : ["__none__"] } },
    });
    if (lab_ids.length) {
      await prisma.logisticsPartnerLab.createMany({
        data: lab_ids.map((lab_id) => ({ partner_id: params.id, lab_id })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/logistics/[id] — remove a partner, its riders and assignments. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.$transaction([
    prisma.logisticsPartnerLab.deleteMany({ where: { partner_id: params.id } }),
    prisma.rider.deleteMany({ where: { partner_id: params.id } }),
    prisma.logisticsSession.deleteMany({ where: { partner_id: params.id } }),
    prisma.logisticsPartner.delete({ where: { id: params.id } }),
  ]).catch(() => {});

  return NextResponse.json({ success: true });
}
