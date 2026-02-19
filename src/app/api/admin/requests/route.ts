import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
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

    // Paginated requests + efficient aggregate counts in parallel
    const [requests, total, incomingCount, seenCount, doneCount, byLabCounts] = await Promise.all([
      prisma.request.findMany({
        where,
        include: { lab: { select: { name: true, addresses: true } } },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.request.count({ where }),
      prisma.request.count({ where: { status: "incoming" } }),
      prisma.request.count({ where: { status: "seen" } }),
      prisma.request.count({ where: { status: "done" } }),
      prisma.request.groupBy({ by: ["lab_id"], _count: { id: true } }),
    ]);

    const labIds = byLabCounts.map((l) => l.lab_id);
    const labs = await prisma.lab.findMany({
      where: { id: { in: labIds } },
      select: { id: true, name: true },
    });
    const labNameMap = Object.fromEntries(labs.map((l) => [l.id, l.name]));

    const byLab = byLabCounts
      .map((l) => ({ lab_id: l.lab_id, lab_name: labNameMap[l.lab_id] ?? l.lab_id, total: l._count.id }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      success: true,
      requests,
      total,
      page,
      metrics: {
        total: incomingCount + seenCount + doneCount,
        incoming: incomingCount,
        seen: seenCount,
        done: doneCount,
        byLab,
      },
    });
  } catch (error) {
    console.error("Admin requests error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
