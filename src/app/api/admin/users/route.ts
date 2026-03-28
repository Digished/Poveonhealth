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
  const role = searchParams.get("role") ?? "all"; // "all" | "doctor" | "lab"

  const results: {
    email: string; name: string | null; phone: string | null;
    role: string; sub_role: string | null; detail: string | null;
    updated_at: string; has_pin: boolean;
  }[] = [];

  // Doctors
  if (role === "all" || role === "doctor") {
    const doctors = await prisma.doctorProfile.findMany({
      orderBy: { updated_at: "desc" },
      select: { email: true, prefix: true, full_name: true, phone: true, hospitals: true, pin_hash: true, updated_at: true },
    });
    for (const d of doctors) {
      results.push({
        email: d.email,
        name: [d.prefix, d.full_name].filter(Boolean).join(" ") || null,
        phone: d.phone,
        role: "doctor",
        sub_role: null,
        detail: (d.hospitals as string[]).slice(0, 2).join(", ") || null,
        updated_at: d.updated_at.toISOString(),
        has_pin: !!d.pin_hash,
      });
    }
  }

  // Lab members
  if (role === "all" || role === "lab") {
    const members = await prisma.labMember.findMany({
      orderBy: { created_at: "desc" },
      select: {
        email: true,
        created_at: true,
        role: { select: { name: true } },
        lab: { select: { name: true } },
      },
    });
    for (const m of members) {
      if (!m.email) continue;
      results.push({
        email: m.email,
        name: null,
        phone: null,
        role: "lab",
        sub_role: m.role.name,
        detail: m.lab.name,
        updated_at: m.created_at.toISOString(),
        has_pin: false,
      });
    }
  }

  const filtered = q
    ? results.filter((u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name ?? "").toLowerCase().includes(q) ||
        (u.detail ?? "").toLowerCase().includes(q)
      )
    : results;

  return NextResponse.json({ users: filtered });
}
