export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * POST /api/admin/labs/[id]/transfer-email
 * Body: { new_email: string }
 *
 * Updates the lab's contact email and the linked Supabase auth user's
 * login email, effectively transferring dashboard access to the new address.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { new_email } = await request.json();
    if (!new_email || typeof new_email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email.trim())) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }
    const email = new_email.trim().toLowerCase();

    // Load lab and its owner LabUser
    const lab = await prisma.lab.findUnique({
      where: { id: params.id },
      include: { lab_users: true },
    });
    if (!lab) return NextResponse.json({ error: "Lab not found" }, { status: 404 });

    // Reject if the email is already taken by another lab
    const existing = await prisma.lab.findUnique({ where: { email } });
    if (existing && existing.id !== lab.id) {
      return NextResponse.json({ error: "That email address is already registered to another lab" }, { status: 409 });
    }

    const supabaseAdmin = createAdminClient();

    // Update the Supabase auth user email (owner login)
    const labUser = lab.lab_users[0];
    if (labUser) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        labUser.user_id,
        { email }
      );
      if (authError) {
        return NextResponse.json({ error: `Auth update failed: ${authError.message}` }, { status: 500 });
      }
    }

    // Update the Lab record email
    await prisma.lab.update({
      where: { id: lab.id },
      data: { email },
    });

    return NextResponse.json({ success: true, new_email: email });
  } catch (err) {
    console.error("[transfer-email]", err);
    return NextResponse.json({ error: "Failed to transfer email" }, { status: 500 });
  }
}
