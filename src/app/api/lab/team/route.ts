export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { logLabActivity } from "@/lib/lab-activity";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { labMemberWelcome } from "@/lib/email/templates";

// GET /api/lab/team — returns team members for the authenticated lab owner
// Only the main lab account (role: "lab") can call this; members cannot manage other members here
export async function GET() {
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user || user.user_metadata?.role !== "lab") {
      return NextResponse.json({ success: false, error: "Lab owner access required" }, { status: 403 });
    }

    const labUser = await prisma.labUser.findUnique({
      where: { user_id: user.id },
      select: { lab_id: true },
    });
    if (!labUser) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

    const members = await prisma.labMember.findMany({
      where: { lab_id: labUser.lab_id },
      include: { role: { select: { id: true, name: true } } },
      orderBy: { created_at: "asc" },
    });

    // Enrich with last_sign_in_at from Supabase auth
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
    console.error("Lab team fetch error:", e);
    return NextResponse.json({ success: false, error: "Failed to load team" }, { status: 500 });
  }
}

const InviteSchema = z.object({
  email: z.string().email(),
  role_id: z.string().uuid(),
  name: z.string().max(120).optional(),
});

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let pass = "";
  for (let i = 0; i < 12; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

/**
 * POST /api/lab/team — the lab super admin (owner) or a member with
 * can_manage_team adds a new staff member: creates their login, assigns a
 * role, and emails them their credentials. Mirrors the Poveon-admin invite
 * so labs no longer depend on Poveon to build their team.
 */
export async function POST(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_manage_team) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const parsed = InviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "A valid email and role are required" }, { status: 400 });
  const { email, role_id, name } = parsed.data;

  const lab = await prisma.lab.findUnique({ where: { id: auth.lab_id }, select: { id: true, name: true } });
  if (!lab) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

  // Role must belong to this lab.
  const role = await prisma.labRole.findFirst({ where: { id: role_id, lab_id: auth.lab_id }, select: { id: true, name: true } });
  if (!role) return NextResponse.json({ success: false, error: "Role not found for this lab" }, { status: 404 });

  const password = generatePassword();
  const adminSupabase = createAdminClient();
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "lab_member", lab_id: auth.lab_id },
  });

  if (authError || !authData?.user) {
    if (authError?.message.toLowerCase().includes("already")) {
      return NextResponse.json({ success: false, error: "A user with this email already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: authError?.message ?? "Could not create the member" }, { status: 400 });
  }

  const member = await prisma.labMember.create({
    data: { lab_id: auth.lab_id, user_id: authData.user.id, email, name: name?.trim() || null, role_id },
    include: { role: { select: { id: true, name: true } } },
  });

  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://poveon.com"}/lab-login`;
  resend.emails
    .send({
      from: FROM_ADDRESS,
      to: email,
      subject: `You've been added to ${lab.name} — Poveon`,
      html: labMemberWelcome({ labName: lab.name, roleName: role.name, email, tempPassword: password, loginUrl }),
    })
    .catch((e) => console.error("[lab-team invite] email send failed:", e));

  if (auth.actor_email) {
    logLabActivity({ lab_id: auth.lab_id, actor_email: auth.actor_email, action: "member_added", detail: `${email} · ${role.name}` });
  }

  return NextResponse.json({ success: true, member, tempPassword: password }, { status: 201 });
}
