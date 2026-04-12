export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminAuth } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * PUT /api/admin/labs/[id]/free-trial
 * Toggle free trial status for a lab
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const labId = (await params).id;
  const admin = await verifyAdminAuth();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 }
      );
    }

    // Update lab free_trial status
    const lab = await prisma.lab.update({
      where: { id: labId },
      data: { free_trial: enabled },
      select: {
        id: true,
        name: true,
        free_trial: true,
      },
    });

    return NextResponse.json({
      success: true,
      lab,
      message: `Free trial ${enabled ? "enabled" : "disabled"} for ${lab.name}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Record to update not found")) {
      return NextResponse.json(
        { error: "Lab not found" },
        { status: 404 }
      );
    }
    console.error("[lab-free-trial] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update lab" },
      { status: 500 }
    );
  }
}
