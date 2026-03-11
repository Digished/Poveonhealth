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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RoleSchema = z.object({
  name: z.string().min(1).max(60),
  can_view_requests:   z.boolean().default(true),
  can_mark_seen:       z.boolean().default(false),
  can_mark_done:       z.boolean().default(false),
  can_send_results:    z.boolean().default(false),
  can_manage_team:     z.boolean().default(false),
  can_manage_api_keys: z.boolean().default(false),
  can_view_referrals:  z.boolean().default(false),
});

// GET /api/admin/labs/[id]/roles
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: "Invalid lab ID" }, { status: 400 });

    const roles = await prisma.labRole.findMany({
      where: { lab_id: params.id },
      include: { _count: { select: { members: true } } },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({ success: true, roles });
  } catch (e) {
    console.error("List roles error:", e);
    return NextResponse.json({ success: false, error: "Failed to list roles" }, { status: 500 });
  }
}

// POST /api/admin/labs/[id]/roles
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: "Invalid lab ID" }, { status: 400 });

    const labExists = await prisma.lab.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!labExists) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

    const body = await req.json();
    const parsed = RoleSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

    const role = await prisma.labRole.create({
      data: { lab_id: params.id, ...parsed.data },
    });

    return NextResponse.json({ success: true, role }, { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ success: false, error: "A role with that name already exists for this lab" }, { status: 409 });
    }
    console.error("Create role error:", e);
    return NextResponse.json({ success: false, error: "Failed to create role" }, { status: 500 });
  }
}
