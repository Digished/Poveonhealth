export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const PatchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  contact_email: z.string().email().nullable().optional().or(z.literal("")),
  contact_phone: z.string().max(32).nullable().optional().or(z.literal("")),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { hmoId: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const parsed = PatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    }

    const hmo = await prisma.hmo.findUnique({ where: { id: params.hmoId } });
    if (!hmo) return NextResponse.json({ error: "HMO not found" }, { status: 404 });

    const data = parsed.data;
    const updated = await prisma.hmo.update({
      where: { id: hmo.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.contact_email !== undefined
          ? { contact_email: data.contact_email ? data.contact_email.trim() : null }
          : {}),
        ...(data.contact_phone !== undefined
          ? { contact_phone: data.contact_phone ? data.contact_phone.trim() : null }
          : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });

    return NextResponse.json({ success: true, hmo: updated });
  } catch (err) {
    console.error("[admin/hmo PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
