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

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  const users = await prisma.doctorProfile.findMany({
    orderBy: { updated_at: "desc" },
    select: {
      email: true,
      prefix: true,
      full_name: true,
      phone: true,
      hospitals: true,
      pin_hash: true,
      updated_at: true,
    },
  });

  const filtered = q
    ? users.filter((u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q)
      )
    : users;

  return NextResponse.json({
    users: filtered.map((u) => ({
      email: u.email,
      prefix: u.prefix,
      full_name: u.full_name,
      phone: u.phone,
      hospitals: u.hospitals,
      has_pin: !!u.pin_hash,
      updated_at: u.updated_at,
    })),
  });
}
