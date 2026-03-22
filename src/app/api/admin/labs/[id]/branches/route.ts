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

/** GET /api/admin/labs/[id]/branches — list branches with full branch_lab info */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const branches = await prisma.labBranch.findMany({
    where: { lab_id: id },
    include: {
      branch_lab: { select: { id: true, name: true, address: true, phones: true, whatsapp: true } },
    },
    orderBy: [{ is_main: "desc" }],
  });
  return NextResponse.json({ success: true, branches });
}

/** POST /api/admin/labs/[id]/branches — link an existing lab as a branch */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await verifyAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const branch_lab_id: string | undefined = body.branch_lab_id;
  const is_main: boolean = body.is_main ?? false;

  if (!branch_lab_id) return NextResponse.json({ error: "branch_lab_id is required" }, { status: 400 });
  if (branch_lab_id === id) return NextResponse.json({ error: "A lab cannot be its own branch" }, { status: 400 });

  // Verify both labs exist
  const [parent, child] = await Promise.all([
    prisma.lab.findUnique({ where: { id }, select: { id: true } }),
    prisma.lab.findUnique({ where: { id: branch_lab_id }, select: { id: true } }),
  ]);
  if (!parent) return NextResponse.json({ error: "Parent lab not found" }, { status: 404 });
  if (!child) return NextResponse.json({ error: "Branch lab not found" }, { status: 404 });

  // Check for circular — the branch_lab should not already be a parent of this lab
  const circular = await prisma.labBranch.findFirst({
    where: { lab_id: branch_lab_id, branch_lab_id: id },
  });
  if (circular) return NextResponse.json({ error: "Circular branch relationship" }, { status: 400 });

  if (is_main) {
    await prisma.labBranch.updateMany({ where: { lab_id: id }, data: { is_main: false } });
  }

  const branch = await prisma.labBranch.upsert({
    where: { lab_id_branch_lab_id: { lab_id: id, branch_lab_id } },
    create: { lab_id: id, branch_lab_id, is_main },
    update: { is_main },
    include: { branch_lab: { select: { id: true, name: true, address: true, phones: true } } },
  });
  return NextResponse.json({ success: true, branch }, { status: 201 });
}
