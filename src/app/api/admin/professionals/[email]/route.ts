export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

/**
 * DELETE /api/admin/professionals/[email]
 * Removes a doctor profile (and their marketer link, if any).
 * Only works for unclaimed profiles to protect live accounts.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { email: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const email = decodeURIComponent(params.email).trim().toLowerCase();

    const profile = await prisma.doctorProfile.findUnique({
      where: { email },
      select: { claimed: true },
    });

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    if (profile.claimed) {
      return NextResponse.json(
        { error: "Cannot delete an active doctor account. Suspend or contact the doctor directly." },
        { status: 409 }
      );
    }

    // Delete marketer link if present (cascade would handle it but let's be explicit)
    await prisma.doctorMarketerLink.deleteMany({ where: { doctor_email: email } });
    await prisma.doctorProfile.delete({ where: { email } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/professionals/[email] DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
