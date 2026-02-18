import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Authenticate and verify admin
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
    if (!adminRecord) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const labId = searchParams.get("lab_id") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
    const skip = (page - 1) * limit;

    const where = {
      ...(labId ? { lab_id: labId } : {}),
      ...(status ? { status } : {}),
    };

    const [requests, total, allRequests] = await Promise.all([
      prisma.request.findMany({
        where,
        include: { lab: { select: { name: true, addresses: true } } },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.request.count({ where }),
      prisma.request.findMany({
        select: { status: true, lab_id: true, lab: { select: { name: true } } },
      }),
    ]);

    // Aggregate metrics
    const byStatus = { incoming: 0, seen: 0, done: 0 };
    const byLabMap: Record<string, { lab_name: string; total: number }> = {};

    for (const r of allRequests) {
      byStatus[r.status as keyof typeof byStatus]++;
      if (!byLabMap[r.lab_id]) {
        byLabMap[r.lab_id] = { lab_name: r.lab?.name ?? r.lab_id, total: 0 };
      }
      byLabMap[r.lab_id].total++;
    }

    const byLab = Object.entries(byLabMap).map(([lab_id, v]) => ({ lab_id, ...v }));

    return NextResponse.json({
      success: true,
      requests,
      total,
      page,
      metrics: { total: allRequests.length, ...byStatus, byLab },
    });
  } catch (error) {
    console.error("Admin requests error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
