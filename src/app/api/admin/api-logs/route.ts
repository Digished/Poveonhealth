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

// GET /api/admin/api-logs?limit=200
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "200"), 500);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    // Fetch recent logs + aggregate counts in parallel
    const [logs, todayCount, weekCount, endpointCounts, statusCounts] = await Promise.all([
      prisma.apiLog.findMany({
        orderBy: { created_at: "desc" },
        take: limit,
      }),
      prisma.apiLog.count({ where: { created_at: { gte: startOfToday } } }),
      prisma.apiLog.count({ where: { created_at: { gte: startOfWeek } } }),
      // Top endpoints by call count (last 7 days)
      prisma.apiLog.groupBy({
        by: ["path"],
        _count: { path: true },
        where: { created_at: { gte: startOfWeek } },
        orderBy: { _count: { path: "desc" } },
        take: 10,
      }),
      // Calls by HTTP status (last 7 days)
      prisma.apiLog.groupBy({
        by: ["status"],
        _count: { status: true },
        where: { created_at: { gte: startOfWeek } },
        orderBy: { _count: { status: "desc" } },
      }),
    ]);

    return NextResponse.json({
      success: true,
      logs,
      summary: {
        today: todayCount,
        week: weekCount,
        topEndpoints: endpointCounts.map((r) => ({ path: r.path, count: r._count.path })),
        byStatus: statusCounts.map((r) => ({ status: r.status, count: r._count.status })),
      },
    });
  } catch (error) {
    console.error("api-logs error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch logs" }, { status: 500 });
  }
}
