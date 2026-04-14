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
 * GET /api/admin/professionals/check-email?email=...
 * Returns profile info and marketer link for a doctor email.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    const profile = await prisma.doctorProfile.findUnique({
      where: { email },
      select: {
        email: true,
        prefix: true,
        full_name: true,
        phone: true,
        hospitals: true,
        claimed: true,
      },
    });

    if (!profile) {
      return NextResponse.json({ exists: false, claimed: false, data: null, marketer: null });
    }

    const link = await prisma.doctorMarketerLink.findFirst({
      where: { doctor_email: email },
      include: { marketer: { select: { id: true, name: true, email: true } } },
    });

    return NextResponse.json({
      exists:   true,
      claimed:  profile.claimed,
      marketer: link ? { id: link.marketer.id, name: link.marketer.name, email: link.marketer.email } : null,
      data: {
        email:     profile.email,
        full_name: profile.full_name,
        prefix:    profile.prefix,
        phone:     profile.phone,
        hospitals: profile.hospitals,
      },
    });
  } catch (err) {
    console.error("[admin/professionals/check-email GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
