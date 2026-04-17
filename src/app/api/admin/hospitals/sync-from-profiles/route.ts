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
 * POST /api/admin/hospitals/sync-from-profiles
 *
 * Backfills the hospitals table from every DoctorProfile.hospitals array.
 * Safe to run repeatedly — skipDuplicates handles already-existing names.
 * Case-insensitive dedup: normalises to title-case before comparing.
 *
 * Returns: { created, already_existed }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    // Pull every hospital name string stored on doctor profiles
    const profiles = await prisma.doctorProfile.findMany({
      select: { hospitals: true },
      where: { hospitals: { isEmpty: false } },
    });

    const rawNames = profiles
      .flatMap((p) => p.hospitals)
      .map((n) => n.trim())
      .filter(Boolean);

    // Deduplicate case-insensitively (keep first occurrence's casing)
    const seen = new Map<string, string>(); // lower → original
    for (const n of rawNames) {
      const key = n.toLowerCase();
      if (!seen.has(key)) seen.set(key, n);
    }
    const uniqueNames = Array.from(seen.values());

    if (uniqueNames.length === 0) {
      return NextResponse.json({ success: true, created: 0, already_existed: 0 });
    }

    // Fetch existing hospitals (case-insensitive compare via lower())
    const existing = await prisma.hospital.findMany({ select: { name: true } });
    const existingLower = new Set(existing.map((h) => h.name.toLowerCase()));

    const toCreate = uniqueNames.filter((n) => !existingLower.has(n.toLowerCase()));
    const already_existed = uniqueNames.length - toCreate.length;

    let created = 0;
    if (toCreate.length > 0) {
      const result = await prisma.hospital.createMany({
        data: toCreate.map((name) => ({ name })),
        skipDuplicates: true,
      });
      created = result.count;
    }

    return NextResponse.json({ success: true, created, already_existed });
  } catch (err) {
    console.error("[hospitals/sync-from-profiles]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
