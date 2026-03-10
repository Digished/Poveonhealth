export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const InviteSchema = z.object({
  email:    z.string().email(),
  role_id:  z.string().uuid(),
  password: z.string().min(8).optional(),
});

// GET /api/admin/labs/[id]/members
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: "Invalid lab ID" }, { status: 400 });

    const members = await prisma.labMember.findMany({
      where: { lab_id: params.id },
      include: { role: { select: { id: true, name: true } } },
      orderBy: { created_at: "asc" },
    });

    // Fetch last_sign_in_at from Supabase for each member
    const adminSupabase = createAdminClient();
    const enriched = await Promise.all(
      members.map(async (m) => {
        try {
          const { data } = await adminSupabase.auth.admin.getUserById(m.user_id);
          return { ...m, last_sign_in_at: data.user?.last_sign_in_at ?? null };
        } catch {
          return { ...m, last_sign_in_at: null };
        }
      })
    );

    return NextResponse.json({ success: true, members: enriched });
  } catch (e) {
    console.error("List members error:", e);
    return NextResponse.json({ success: false, error: "Failed to list members" }, { status: 500 });
  }
}

// POST /api/admin/labs/[id]/members — invite a new lab member
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!await verifyAdmin()) return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    if (!UUID_RE.test(params.id)) return NextResponse.json({ success: false, error: "Invalid lab ID" }, { status: 400 });

    const labExists = await prisma.lab.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
    if (!labExists) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

    const body = await req.json();
    const parsed = InviteSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

    // Verify role belongs to this lab
    const roleExists = await prisma.labRole.findFirst({
      where: { id: parsed.data.role_id, lab_id: params.id },
      select: { id: true },
    });
    if (!roleExists) return NextResponse.json({ success: false, error: "Role not found for this lab" }, { status: 404 });

    const password = parsed.data.password ?? generatePassword();

    // Create Supabase auth user
    const adminSupabase = createAdminClient();
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: parsed.data.email,
      password,
      email_confirm: true,
      user_metadata: { role: "lab_member", lab_id: params.id },
    });

    if (authError) {
      if (authError.message.toLowerCase().includes("already")) {
        return NextResponse.json({ success: false, error: "A user with this email already exists" }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: authError.message }, { status: 400 });
    }

    // Create LabMember record — store email for display without extra Supabase lookups
    const member = await prisma.labMember.create({
      data: {
        lab_id:  params.id,
        user_id: authData.user.id,
        email:   parsed.data.email,
        role_id: parsed.data.role_id,
      },
      include: { role: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, member, tempPassword: password }, { status: 201 });
  } catch (e) {
    console.error("Invite member error:", e);
    return NextResponse.json({ success: false, error: "Failed to invite member" }, { status: 500 });
  }
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let pass = "";
  for (let i = 0; i < 12; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}
