export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/lab-marketers
 * List all lab-marketer relationships with stats
 */
export async function GET(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const labId = searchParams.get("lab_id");
    const marketerId = searchParams.get("marketer_id");

    const labMarketers = await prisma.labMarketer.findMany({
      where: {
        ...(labId ? { lab_id: labId } : {}),
        ...(marketerId ? { marketer_id: marketerId } : {}),
      },
      include: {
        lab: { select: { id: true, name: true } },
        marketer: { select: { id: true, name: true, email: true, code: true } },
      },
      orderBy: { added_at: "desc" },
    });

    // Get doctor counts per marketer
    const result = await Promise.all(
      labMarketers.map(async (lm) => {
        const doctorCount = await prisma.doctorMarketerLink.count({
          where: { marketer_id: lm.marketer_id },
        });
        return {
          id: lm.id,
          lab: lm.lab,
          marketer: lm.marketer,
          doctors_count: doctorCount,
          added_at: lm.added_at,
          added_by: lm.added_by,
        };
      })
    );

    return NextResponse.json({ success: true, lab_marketers: result });
  } catch (error) {
    console.error("[admin-lab-marketers] GET error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch lab marketers" },
      { status: 500 }
    );
  }
}
