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

/** PATCH /api/admin/kb/[id] — update canonical_name, synonyms, category, description */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.canonical_name !== undefined) data.canonical_name = String(body.canonical_name).trim();
  if (body.synonyms !== undefined) data.synonyms = Array.isArray(body.synonyms) ? body.synonyms : [];
  if (body.category !== undefined) data.category = body.category?.trim() || null;
  if (body.description !== undefined) data.description = body.description?.trim() || null;

  const test = await prisma.kbTest.update({ where: { id }, data });
  return NextResponse.json({ success: true, test });
}

/** DELETE /api/admin/kb/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.kbTest.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
