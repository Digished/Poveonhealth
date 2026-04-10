export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/labs/[id]/catalog/jobs-history
 *
 * Fetch history of synonym generation jobs for a lab
 * Can filter by status: ?status=processing|completed|failed|all
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const status = req.nextUrl.searchParams.get("status") || "all";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

  try {
    const whereClause = status === "all"
      ? { lab_id: id }
      : { lab_id: id, status };

    const jobs = await prisma.labSynonymGenerationJob.findMany({
      where: whereClause,
      select: {
        id: true,
        total_tests: true,
        completed_tests: true,
        failed_tests: true,
        status: true,
        initiated_by: true,
        started_at: true,
        completed_at: true,
      },
      orderBy: { started_at: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      jobs: jobs.map((job) => ({
        id: job.id,
        totalTests: job.total_tests,
        completedTests: job.completed_tests,
        failedTests: job.failed_tests,
        status: job.status,
        initiatedBy: job.initiated_by,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        percentComplete: job.total_tests > 0
          ? Math.round((job.completed_tests / job.total_tests) * 100)
          : 0,
      })),
    });
  } catch (error) {
    console.error("[jobs-history] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch job history" },
      { status: 500 }
    );
  }
}
