import { NextRequest, NextResponse } from "next/server";
import { verifyLabOwner } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/lab/[labId]/marketers/[marketerId]/doctors?email=doctor@email.com
 * Remove a doctor from a marketer (lab admin only)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string; marketerId: string }> }
) {
  const { labId, marketerId } = await params;

  const lab = await verifyLabOwner(labId);
  if (!lab) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const email = req.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Verify marketer is assigned to this lab
    const labMarketer = await prisma.labMarketer.findUnique({
      where: { lab_id_marketer_id: { lab_id: labId, marketer_id: marketerId } },
    });

    if (!labMarketer) {
      return NextResponse.json(
        { error: "Marketer not assigned to this lab" },
        { status: 404 }
      );
    }

    // Check if link exists
    const link = await prisma.doctorMarketerLink.findFirst({
      where: {
        doctor_email: email,
        marketer_id: marketerId,
      },
    });

    if (!link) {
      return NextResponse.json(
        { error: "Doctor not linked to this marketer" },
        { status: 404 }
      );
    }

    // Delete the link
    await prisma.doctorMarketerLink.delete({
      where: {
        doctor_email: email,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Doctor unassigned from marketer",
    });
  } catch (error) {
    console.error("[lab-marketers-doctors]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unassign doctor" },
      { status: 500 }
    );
  }
}
