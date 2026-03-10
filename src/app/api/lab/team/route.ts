export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// GET /api/lab/team — returns team members for the authenticated lab owner
// Only the main lab account (role: "lab") can call this; members cannot manage other members here
export async function GET() {
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user || user.user_metadata?.role !== "lab") {
      return NextResponse.json({ success: false, error: "Lab owner access required" }, { status: 403 });
    }

    const labUser = await prisma.labUser.findUnique({
      where: { user_id: user.id },
      select: { lab_id: true },
    });
    if (!labUser) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

    const members = await prisma.labMember.findMany({
      where: { lab_id: labUser.lab_id },
      include: { role: { select: { id: true, name: true } } },
      orderBy: { created_at: "asc" },
    });

    // Enrich with last_sign_in_at from Supabase auth
    const adminSupabase = createAdminClient();
    const enriched = await Promise.all(
      members.map(async (m) => {
        try {
          const { data } = await adminSupabase.auth.admin.getUserById(m.user_id);
          return { ...m, last_sign_in_at: data.user?.last_sign_in_at ?? null };
        } catch {
          return { ...m, last_sign_in_at: null };
        }
      })
    );

    return NextResponse.json({ success: true, members: enriched });
  } catch (e) {
    console.error("Lab team fetch error:", e);
    return NextResponse.json({ success: false, error: "Failed to load team" }, { status: 500 });
  }
}
