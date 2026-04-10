/**
 * Internal endpoint for processing incomplete synonym generation jobs.
 * Should be called periodically by a cron service (e.g., Vercel Cron, external service, etc.)
 *
 * Call with: POST /api/internal/process-synonym-jobs?secret=<SYNC_PROCESSING_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processJob, processAllIncompleteJobs } from "@/lib/synonym-job-processor";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.SYNC_PROCESSING_SECRET || "local-dev-secret";

  // Verify the request is authorized
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[process-synonym-jobs] Starting batch processing");

    // Process all incomplete jobs
    await processAllIncompleteJobs();

    console.log("[process-synonym-jobs] Batch processing complete");

    return NextResponse.json({
      success: true,
      message: "All incomplete jobs processed",
    });
  } catch (error) {
    console.error("[process-synonym-jobs] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Alternative: GET endpoint for lightweight checks (returns job stats without processing)
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.SYNC_PROCESSING_SECRET || "local-dev-secret";

  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const incompleteJobs = await prisma.labSynonymGenerationJob.count({
      where: { status: "processing" },
    });

    const pendingTests = await prisma.labSynonymGenerationTestResult.count({
      where: { status: { in: ["pending", "processing"] } },
    });

    return NextResponse.json({
      success: true,
      incompleteJobs,
      pendingTests,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
