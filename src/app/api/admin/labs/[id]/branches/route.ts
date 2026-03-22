export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const BranchSchema = z.object({
  name:     z.string().min(1).max(200),
  address:  z.string().max(500).default(""),
  phones:   z.array(z.string().min(1)).default([]),
  is_main:  z.boolean().default(false),
});

/** GET /api/admin/labs/[id]/branches */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const branches = await prisma.labBranch.findMany({
    where: { lab_id: id },
    orderBy: [{ is_main: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ success: true, branches });
}

/** POST /api/admin/labs/[id]/branches */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const lab = await prisma.lab.findUnique({ where: { id }, select: { id: true } });
  if (!lab) return NextResponse.json({ error: "Lab not found" }, { status: 404 });

  const parsed = BranchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data", details: parsed.error.flatten() }, { status: 400 });

  const { is_main, ...rest } = parsed.data;

  // If marking as main, unset others first
  if (is_main) {
    await prisma.labBranch.updateMany({ where: { lab_id: id }, data: { is_main: false } });
  }

  const branch = await prisma.labBranch.create({
    data: { lab_id: id, ...rest, is_main },
  });
  return NextResponse.json({ success: true, branch }, { status: 201 });
}
