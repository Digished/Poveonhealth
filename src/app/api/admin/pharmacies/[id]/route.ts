export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { pharmacyAccountCreatedEmail } from "@/lib/email/templates";
import { appUrl } from "@/lib/consult";

async function requireAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const PatchSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(80).optional().nullable(),
  discount_percent: z.coerce.number().int().min(0).max(90).optional(),
  active: z.boolean().optional(),
  resend_invite: z.boolean().optional(),
});

/** PATCH /api/admin/pharmacies/[id] — edit terms, deactivate, or re-invite. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid changes." }, { status: 400 });
  const d = parsed.data;

  const existing = await prisma.pharmacy.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Pharmacy not found." }, { status: 404 });

  if (d.resend_invite) {
    const sent = await resend.emails.send({
      from: FROM_ADDRESS,
      to: existing.email,
      subject: `${existing.name} — your Poveon pharmacy account`,
      html: pharmacyAccountCreatedEmail({
        pharmacyName: existing.name,
        code: existing.code,
        discountPercent: existing.discount_percent,
        loginUrl: `${appUrl()}/pharmacy-login`,
      }),
    });
    if (sent.error) {
      console.error("[admin/pharmacies] resend invite:", sent.error);
      return NextResponse.json({ error: "Could not send that invite." }, { status: 502 });
    }
    return NextResponse.json({ success: true, invited: true });
  }

  const updated = await prisma.pharmacy.update({
    where: { id: params.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.phone !== undefined ? { phone: d.phone || null } : {}),
      ...(d.address !== undefined ? { address: d.address || null } : {}),
      ...(d.city !== undefined ? { city: d.city || null } : {}),
      ...(d.state !== undefined ? { state: d.state || null } : {}),
      ...(d.discount_percent !== undefined ? { discount_percent: d.discount_percent } : {}),
      ...(d.active !== undefined ? { active: d.active } : {}),
    },
    select: { id: true, active: true, discount_percent: true },
  });

  return NextResponse.json({ success: true, pharmacy: updated });
}

/**
 * DELETE /api/admin/pharmacies/[id] — remove a partner.
 *
 * A pharmacy that has traded is deactivated rather than deleted, so its
 * customers and the discounts it gave stay on the record.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const redemptions = await prisma.consultRedemption.count({ where: { pharmacy_id: params.id } });
  if (redemptions > 0) {
    await prisma.pharmacy.update({ where: { id: params.id }, data: { active: false } });
    return NextResponse.json({ success: true, deactivated: true });
  }

  await prisma.pharmacy.delete({ where: { id: params.id } }).catch(() => {});
  return NextResponse.json({ success: true, deleted: true });
}
