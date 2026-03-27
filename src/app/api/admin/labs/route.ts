export const dynamic = "force-dynamic";
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

export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const [labs, ratings, poveonByLabRaw, paidByLabRaw] = await Promise.all([
      prisma.lab.findMany({ orderBy: { name: "asc" } }),
      prisma.labFeedback.groupBy({
        by: ["lab_id"],
        _avg: { rating_overall: true },
        _count: { id: true },
      }),
      // Raw SQL — bypasses stale Prisma client for commission columns
      prisma.$queryRaw<Array<{ lab_id: string; total: string }>>`
        SELECT lab_id, COALESCE(SUM(poveon_amount),0)::text AS total
        FROM requests WHERE status IN ('seen','done')
        GROUP BY lab_id`,
      prisma.$queryRaw<Array<{ lab_id: string; total: string }>>`
        SELECT lab_id, COALESCE(SUM(poveon_amount),0)::text AS total
        FROM requests WHERE is_paid_to_poveon = true
        GROUP BY lab_id`,
    ]);

    const ratingsMap = Object.fromEntries(
      ratings.map((r) => [r.lab_id, { avg: r._avg.rating_overall, count: r._count.id }])
    );
    const poveonMap = Object.fromEntries(poveonByLabRaw.map((r) => [r.lab_id, Number(r.total)]));
    const paidMap = Object.fromEntries(paidByLabRaw.map((r) => [r.lab_id, Number(r.total)]));

    const labsWithData = labs.map((lab) => ({
      ...lab,
      rating_avg:         ratingsMap[lab.id]?.avg   ?? null,
      rating_count:       ratingsMap[lab.id]?.count ?? 0,
      poveon_outstanding: (poveonMap[lab.id] ?? 0) - (paidMap[lab.id] ?? 0),
    }));

    return NextResponse.json({ success: true, labs: labsWithData });
  } catch (error) {
    console.error("Admin labs fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load labs" }, { status: 500 });
  }
}
