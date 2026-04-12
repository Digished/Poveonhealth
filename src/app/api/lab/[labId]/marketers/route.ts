export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyLabOwner } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/lab/[labId]/marketers
 * List all marketers assigned to this lab with doctor counts
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string }> }
) {
  const labId = (await params).labId;
  const lab = await verifyLabOwner(labId);
  if (!lab) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const labMarketers = await prisma.labMarketer.findMany({
      where: { lab_id: labId },
      include: {
        marketer: {
          select: { id: true, name: true, email: true, code: true },
        },
      },
      orderBy: { added_at: "desc" },
    });

    // Get doctor counts per marketer
    const marketerIds = labMarketers.map((m) => m.marketer_id);
    const doctorCounts = await Promise.all(
      marketerIds.map(async (marketerId) => {
        const count = await prisma.doctorMarketerLink.count({
          where: { marketer_id: marketerId },
        });
        return { marketerId, count };
      })
    );

    const countMap = Object.fromEntries(
      doctorCounts.map((c) => [c.marketerId, c.count])
    );

    const result = labMarketers.map((lm) => ({
      id: lm.id,
      marketer_id: lm.marketer_id,
      marketer: lm.marketer,
      doctors_count: countMap[lm.marketer_id] || 0,
      added_at: lm.added_at,
      added_by: lm.added_by,
    }));

    return NextResponse.json({ success: true, marketers: result });
  } catch (error) {
    console.error("[lab-marketers] GET error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch marketers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/lab/[labId]/marketers
 * Add a marketer to this lab
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string }> }
) {
  const labId = (await params).labId;
  const lab = await verifyLabOwner(labId);
  if (!lab) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const { email, name } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // Find or create marketer
    let marketer = await prisma.marketer.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!marketer) {
      // Create new marketer with temp PIN
      marketer = await prisma.marketer.create({
        data: {
          name: name || email.split("@")[0],
          email: email.toLowerCase(),
          code: `MKT_${Date.now().toString(36).toUpperCase()}`,
        },
      });
    }

    // Check if already assigned
    const existing = await prisma.labMarketer.findUnique({
      where: {
        lab_id_marketer_id: { lab_id: labId, marketer_id: marketer.id },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "This marketer is already assigned to this lab" },
        { status: 409 }
      );
    }

    // Create assignment
    const labMarketer = await prisma.labMarketer.create({
      data: {
        lab_id: labId,
        marketer_id: marketer.id,
        added_by: lab.owner_email || "unknown",
      },
    });

    return NextResponse.json({
      success: true,
      marketer_id: marketer.id,
      marketer_email: marketer.email,
      message: `Marketer ${marketer.email} added to lab`,
    });
  } catch (error) {
    console.error("[lab-marketers] POST error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to add marketer" },
      { status: 500 }
    );
  }
}
