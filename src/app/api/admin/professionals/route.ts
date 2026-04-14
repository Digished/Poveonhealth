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
 * GET /api/admin/professionals
 * Returns all doctor profiles with marketer link info.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const profiles = await prisma.doctorProfile.findMany({
      orderBy: { updated_at: "desc" },
    });

    const links = await prisma.doctorMarketerLink.findMany({
      include: { marketer: { select: { id: true, name: true, email: true } } },
    });

    const linkMap = new Map(links.map((l) => [l.doctor_email, l]));

    const result = profiles.map((p) => {
      const link = linkMap.get(p.email);
      return {
        email:          p.email,
        prefix:         p.prefix,
        full_name:      p.full_name,
        phone:          p.phone,
        hospitals:      p.hospitals,
        bank_name:      p.bank_name,
        account_number: p.account_number,
        account_name:   p.account_name,
        claimed:        p.claimed,
        updated_at:     p.updated_at,
        marketer: link
          ? { id: link.marketer.id, name: link.marketer.name, email: link.marketer.email }
          : null,
      };
    });

    return NextResponse.json({ success: true, professionals: result });
  } catch (err) {
    console.error("[admin/professionals GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/professionals
 * Admin creates or updates an unclaimed doctor profile.
 * Body: { email, full_name, prefix?, phone?, hospitals?, bank_name?, account_number?, account_name? }
 *
 * Does NOT create a marketer link (admin-side profiles are unlinked by default).
 * Will NOT overwrite a claimed profile's core data.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = await request.json();
    const { email, full_name, prefix, phone, hospitals, bank_name, account_number, account_name } = body;

    if (!email?.trim())     return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (!full_name?.trim()) return NextResponse.json({ error: "Full name is required." }, { status: 400 });

    const normalised = email.trim().toLowerCase();

    const existing = await prisma.doctorProfile.findUnique({
      where: { email: normalised },
      select: { claimed: true },
    });

    if (existing?.claimed) {
      return NextResponse.json(
        { error: "This doctor has an active account. Their profile is managed by themselves." },
        { status: 409 }
      );
    }

    const profile = await prisma.doctorProfile.upsert({
      where: { email: normalised },
      create: {
        email:          normalised,
        prefix:         prefix?.trim()        || null,
        full_name:      full_name.trim(),
        phone:          phone?.trim()          || null,
        hospitals:      Array.isArray(hospitals) ? hospitals.filter(Boolean) : [],
        bank_name:      bank_name?.trim()      || null,
        account_number: account_number?.trim() || null,
        account_name:   account_name?.trim()   || null,
        claimed:        false,
      },
      update: {
        prefix:         prefix?.trim()        || null,
        full_name:      full_name.trim(),
        phone:          phone?.trim()          || null,
        hospitals:      Array.isArray(hospitals) ? hospitals.filter(Boolean) : [],
        bank_name:      bank_name?.trim()      || null,
        account_number: account_number?.trim() || null,
        account_name:   account_name?.trim()   || null,
      },
    });

    return NextResponse.json({ success: true, profile });
  } catch (err) {
    console.error("[admin/professionals POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
