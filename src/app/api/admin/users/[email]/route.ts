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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { email: string } },
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const email = decodeURIComponent(params.email).toLowerCase().trim();

  // Delete sessions first (FK), then profile
  await prisma.doctorSession.deleteMany({ where: { doctor_email: email } });
  await prisma.doctorOtp.deleteMany({ where: { email } });
  await prisma.doctorProfile.delete({ where: { email } });

  return NextResponse.json({ success: true });
}
