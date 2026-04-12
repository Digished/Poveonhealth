export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyLabOwner } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

/**
 * DELETE /api/lab/[labId]/marketers/[marketerId]
 * Remove marketer from lab, optionally reassign doctors
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string; marketerId: string }> }
) {
  const { labId, marketerId } = await params;
  const lab = await verifyLabOwner(labId);
  if (!lab) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(req.url);
    const reassignTo = searchParams.get("reassign_to");

    // Verify marketer is assigned to this lab
    const labMarketer = await prisma.labMarketer.findUnique({
      where: {
        lab_id_marketer_id: { lab_id: labId, marketer_id: marketerId },
      },
    });

    if (!labMarketer) {
      return NextResponse.json(
        { success: false, error: "Marketer not assigned to this lab" },
        { status: 404 }
      );
    }

    // If reassigning, verify new marketer is also assigned to this lab
    if (reassignTo) {
      const newMarketer = await prisma.labMarketer.findUnique({
        where: {
          lab_id_marketer_id: { lab_id: labId, marketer_id: reassignTo },
        },
      });
      if (!newMarketer) {
        return NextResponse.json(
          { success: false, error: "New marketer not assigned to this lab" },
          { status: 404 }
        );
      }
    }

    // Remove the assignment
    await prisma.labMarketer.delete({
      where: { id: labMarketer.id },
    });

    return NextResponse.json({
      success: true,
      message: "Marketer removed from lab",
    });
  } catch (error) {
    console.error("[lab-marketers-delete] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to remove marketer" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/lab/[labId]/marketers/[marketerId]/doctors
 * List doctors added by this marketer
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string; marketerId: string }> }
) {
  const { labId, marketerId } = await params;
  const lab = await verifyLabOwner(labId);
  if (!lab) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Verify marketer is assigned to this lab
    const labMarketer = await prisma.labMarketer.findUnique({
      where: {
        lab_id_marketer_id: { lab_id: labId, marketer_id: marketerId },
      },
    });

    if (!labMarketer) {
      return NextResponse.json(
        { success: false, error: "Marketer not assigned to this lab" },
        { status: 404 }
      );
    }

    // Get doctors added by this marketer
    const doctors = await prisma.doctorMarketerLink.findMany({
      where: { marketer_id: marketerId },
      select: {
        doctor_email: true,
      },
    });

    // Get doctor details
    const doctorEmails = doctors.map((d) => d.doctor_email);
    const doctorProfiles = await prisma.doctorProfile.findMany({
      where: { email: { in: doctorEmails } },
      select: {
        email: true,
        full_name: true,
        hospitals: true,
      },
    });

    // Get request counts for each doctor to this lab
    const requestCounts = await Promise.all(
      doctorEmails.map(async (email) => {
        const count = await prisma.request.count({
          where: {
            doctor_email: email,
            lab_id: labId,
          },
        });
        return { email, count };
      })
    );

    const countMap = Object.fromEntries(
      requestCounts.map((c) => [c.email, c.count])
    );

    const result = doctorProfiles.map((doc) => ({
      email: doc.email,
      name: doc.full_name || doc.email.split("@")[0],
      hospitals: doc.hospitals || [],
      request_count: countMap[doc.email] || 0,
    }));

    return NextResponse.json({
      success: true,
      doctors: result.sort((a, b) => b.request_count - a.request_count),
    });
  } catch (error) {
    console.error("[lab-marketers-doctors] GET error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch doctors" },
      { status: 500 }
    );
  }
}
