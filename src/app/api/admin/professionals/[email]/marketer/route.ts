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
 * PATCH /api/admin/professionals/[email]/marketer
 * Body: { marketer_id: string }
 * Assigns (or reassigns) a marketer to this doctor. Upserts DoctorMarketerLink.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { email: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const email = decodeURIComponent(params.email).trim().toLowerCase();
    const { marketer_id } = await request.json();

    if (!marketer_id) return NextResponse.json({ error: "marketer_id required" }, { status: 400 });

    const [profile, marketer] = await Promise.all([
      prisma.doctorProfile.findUnique({ where: { email }, select: { email: true } }),
      prisma.marketer.findUnique({ where: { id: marketer_id }, select: { id: true, name: true } }),
    ]);

    if (!profile) return NextResponse.json({ error: "Professional not found" }, { status: 404 });
    if (!marketer) return NextResponse.json({ error: "Marketer not found" }, { status: 404 });

    await prisma.doctorMarketerLink.upsert({
      where: { doctor_email: email },
      create: { doctor_email: email, marketer_id },
      update: { marketer_id },
    });

    return NextResponse.json({ success: true, marketer_name: marketer.name });
  } catch (err) {
    console.error("[professionals/[email]/marketer PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/professionals/[email]/marketer
 * Removes the marketer assignment for this doctor.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { email: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const email = decodeURIComponent(params.email).trim().toLowerCase();

    await prisma.doctorMarketerLink.deleteMany({ where: { doctor_email: email } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[professionals/[email]/marketer DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
