export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/lab-marketers/[labId]/activity
 * Get activity log for a lab's marketers
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string }> }
) {
  const labId = (await params).labId;
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Get lab info
    const lab = await prisma.lab.findUnique({
      where: { id: labId },
      select: { id: true, name: true },
    });

    if (!lab) {
      return NextResponse.json({ error: "Lab not found" }, { status: 404 });
    }

    // Get all marketers assigned to this lab
    const labMarketers = await prisma.labMarketer.findMany({
      where: { lab_id: labId },
      include: {
        marketer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { added_at: "desc" },
    });

    // Build activity timeline
    const events: any[] = [];

    // Add marketer assignment events
    for (const lm of labMarketers) {
      events.push({
        type: "marketer_added",
        timestamp: lm.added_at,
        lab_name: lab.name,
        marketer_name: lm.marketer.name,
        marketer_email: lm.marketer.email,
        added_by: lm.added_by,
        description: `Marketer "${lm.marketer.name}" added by ${lm.added_by}`,
      });

      // Get doctors added by this marketer
      const doctors = await prisma.doctorMarketerLink.findMany({
        where: { marketer_id: lm.marketer_id },
        select: {
          doctor_email: true,
          created_at: true,
        },
      });

      for (const doc of doctors) {
        events.push({
          type: "doctor_added",
          timestamp: doc.created_at,
          lab_name: lab.name,
          marketer_name: lm.marketer.name,
          doctor_email: doc.doctor_email,
          description: `Doctor "${doc.doctor_email}" added by marketer "${lm.marketer.name}"`,
        });
      }
    }

    // Get requests to this lab from doctors under these marketers
    const marketerIds = labMarketers.map((m) => m.marketer_id);
    if (marketerIds.length > 0) {
      const doctorEmails = await prisma.doctorMarketerLink.findMany({
        where: { marketer_id: { in: marketerIds } },
        select: { doctor_email: true },
        distinct: ["doctor_email"],
      });

      const emails = doctorEmails.map((d) => d.doctor_email);
      if (emails.length > 0) {
        const requests = await prisma.request.findMany({
          where: {
            lab_id: labId,
            doctor_email: { in: emails },
          },
          select: {
            id: true,
            code: true,
            doctor_email: true,
            created_at: true,
          },
          orderBy: { created_at: "desc" },
          take: 100, // Limit to last 100 requests
        });

        for (const req of requests) {
          // Find marketer for this doctor
          const docLink = await prisma.doctorMarketerLink.findFirst({
            where: { doctor_email: req.doctor_email },
            include: { marketer: { select: { name: true } } },
          });

          events.push({
            type: "request_created",
            timestamp: req.created_at,
            lab_name: lab.name,
            doctor_email: req.doctor_email,
            marketer_name: docLink?.marketer.name,
            request_code: req.code,
            description: `Request "${req.code}" from doctor "${req.doctor_email}"`,
          });
        }
      }
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      success: true,
      lab_name: lab.name,
      events: events.slice(0, 200), // Return last 200 events
    });
  } catch (error) {
    console.error("[admin-lab-marketers-activity] error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
