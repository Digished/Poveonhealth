export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/** PATCH /api/admin/hospitals/[id] — update name/city/is_active */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.city !== undefined) data.city = body.city?.trim() || null;
  if (body.is_active !== undefined) data.is_active = Boolean(body.is_active);
  const hospital = await prisma.hospital.update({ where: { id }, data });
  return NextResponse.json({ success: true, hospital });
}

/** DELETE /api/admin/hospitals/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.hospital.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
