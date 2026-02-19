import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function verifyAdmin() {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

// GET /api/admin/labs — returns ALL labs (including hidden) for admin dashboard
export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const labs = await prisma.lab.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, labs });
  } catch (error) {
    console.error("Admin labs fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load labs" }, { status: 500 });
  }
}
