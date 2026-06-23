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

/**
 * POST /api/admin/lab-marketers
 * Admin assigns a marketer to a lab (creating the marketer if new).
 * Body: { lab_id, email, name? }
 */
export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { lab_id, email, name } = await req.json();
    if (!lab_id || !email || typeof email !== "string") {
      return NextResponse.json({ success: false, error: "lab_id and email are required" }, { status: 400 });
    }

    const lab = await prisma.lab.findUnique({ where: { id: lab_id }, select: { id: true } });
    if (!lab) return NextResponse.json({ success: false, error: "Lab not found" }, { status: 404 });

    const normalised = email.trim().toLowerCase();
    let marketer = await prisma.marketer.findUnique({ where: { email: normalised } });
    if (!marketer) {
      marketer = await prisma.marketer.create({
        data: {
          name: (name && String(name).trim()) || normalised.split("@")[0],
          email: normalised,
          code: `MKT_${Date.now().toString(36).toUpperCase()}`,
        },
      });
    }

    const existing = await prisma.labMarketer.findUnique({
      where: { lab_id_marketer_id: { lab_id, marketer_id: marketer.id } },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "This marketer is already assigned to this lab" }, { status: 409 });
    }

    await prisma.labMarketer.create({
      data: { lab_id, marketer_id: marketer.id, added_by: admin.email ?? "Poveon Admin" },
    });

    return NextResponse.json({ success: true, marketer: { id: marketer.id, name: marketer.name, email: marketer.email, code: marketer.code } });
  } catch (error) {
    console.error("[admin-lab-marketers] POST error:", error);
    return NextResponse.json({ success: false, error: "Failed to assign marketer" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/lab-marketers?id=<labMarketerId>
 * Admin removes a marketer from a lab (the marketer account is kept).
 */
export async function DELETE(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
    await prisma.labMarketer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin-lab-marketers] DELETE error:", error);
    return NextResponse.json({ success: false, error: "Failed to remove marketer" }, { status: 500 });
  }
}
