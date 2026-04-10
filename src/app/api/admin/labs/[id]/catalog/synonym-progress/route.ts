export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const jobId = req.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId parameter required" }, { status: 400 });
  }

  // Fetch the job from database
  const job = await prisma.labSynonymGenerationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      lab_id: true,
      total_tests: true,
      completed_tests: true,
      failed_tests: true,
      status: true,
      error_message: true,
      started_at: true,
      completed_at: true,
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Verify the job belongs to this lab
  if (job.lab_id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isComplete = job.status === "completed" || job.status === "failed";
  const percent = job.total_tests > 0 ? Math.round((job.completed_tests / job.total_tests) * 100) : 0;

  return NextResponse.json({
    success: true,
    jobId: job.id,
    status: job.status,
    isComplete,
    percent,
    completed: job.completed_tests,
    failed: job.failed_tests,
    total: job.total_tests,
    errorMessage: job.error_message,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  });
}
