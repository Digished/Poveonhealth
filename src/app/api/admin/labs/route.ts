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

// GET /api/admin/labs — returns ALL labs (including hidden) for admin dashboard
export async function GET() {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const [labs, ratings, wallets] = await Promise.all([
      prisma.lab.findMany({ orderBy: { name: "asc" } }),
      prisma.labFeedback.groupBy({
        by: ["lab_id"],
        _avg: { rating_overall: true },
        _count: { id: true },
      }),
      prisma.labWallet.findMany({ select: { lab_id: true, balance: true } }),
    ]);

    const ratingsMap = Object.fromEntries(
      ratings.map((r) => [r.lab_id, { avg: r._avg.rating_overall, count: r._count.id }])
    );
    const walletMap = Object.fromEntries(wallets.map((w) => [w.lab_id, Number(w.balance)]));

    const labsWithData = labs.map((lab) => ({
      ...lab,
      rating_avg:     ratingsMap[lab.id]?.avg   ?? null,
      rating_count:   ratingsMap[lab.id]?.count ?? 0,
      wallet_balance: walletMap[lab.id]         ?? 0,
    }));

    return NextResponse.json({ success: true, labs: labsWithData });
  } catch (error) {
    console.error("Admin labs fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load labs" }, { status: 500 });
  }
}
