export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";

// In-memory progress tracker (resets on deployment)
// Format: "labId-operationId" => { total, completed, testIds }
const operationProgress = new Map<string, { total: number; completed: number; testIds: string[]; started: number }>();

export const operations = operationProgress; // Export for bulk route to use

/**
 * GET /api/admin/labs/[id]/catalog/progress?operation=<operationId>
 * Returns progress for an ongoing bulk operation
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const operationId = searchParams.get("operation");

  if (!operationId) {
    return NextResponse.json({ error: "operation required" }, { status: 400 });
  }

  const key = `${id}-${operationId}`;
  const progress = operationProgress.get(key);

  if (!progress) {
    return NextResponse.json({ error: "Operation not found or completed" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    total: progress.total,
    completed: progress.completed,
    percent: Math.round((progress.completed / progress.total) * 100),
    isComplete: progress.completed >= progress.total,
  });
}
