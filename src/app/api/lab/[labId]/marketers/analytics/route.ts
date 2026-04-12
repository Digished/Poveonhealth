export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { verifyLabOwner } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

interface MarketerMetrics {
  marketer_id: string;
  marketer_name: string;
  marketer_email: string;
  doctors_count: number;
  total_requests: number;
  incoming_requests: number;
  seen_requests: number;
  completed_requests: number;
  conversion_rate: number; // percentage of seen/done vs total
  completion_rate: number; // percentage of done vs total
  total_revenue: number;
  tests: Record<string, number>; // test name -> count
  average_revenue_per_request: number;
  average_revenue_per_doctor: number;
  linked_since: string;
}

/**
 * GET /api/lab/[labId]/marketers/analytics
 * Get comprehensive analytics for all marketers
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ labId: string }> }
) {
  const labId = (await params).labId;
  const lab = await verifyLabOwner(labId);
  if (!lab) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // Get all marketers assigned to this lab
    const labMarketers = await prisma.labMarketer.findMany({
      where: { lab_id: labId },
      include: {
        marketer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { added_at: "desc" },
    });

    if (labMarketers.length === 0) {
      return NextResponse.json({
        success: true,
        analytics: [],
        summary: {
          total_marketers: 0,
          total_doctors: 0,
          total_requests: 0,
          total_revenue: 0,
        },
      });
    }

    const marketersData: MarketerMetrics[] = [];
    let summaryTotalDoctors = 0;
    let summaryTotalRequests = 0;
    let summaryTotalRevenue = 0;

    for (const labMarketer of labMarketers) {
      // Get doctors linked to this marketer
      const doctors = await prisma.doctorMarketerLink.findMany({
        where: { marketer_id: labMarketer.marketer_id },
        select: { doctor_email: true },
      });

      const doctorEmails = doctors.map((d) => d.doctor_email);
      const doctorCount = doctorEmails.length;

      if (doctorCount === 0) {
        // No doctors, add empty metrics
        marketersData.push({
          marketer_id: labMarketer.marketer_id,
          marketer_name: labMarketer.marketer.name,
          marketer_email: labMarketer.marketer.email,
          doctors_count: 0,
          total_requests: 0,
          incoming_requests: 0,
          seen_requests: 0,
          completed_requests: 0,
          conversion_rate: 0,
          completion_rate: 0,
          total_revenue: 0,
          tests: {},
          average_revenue_per_request: 0,
          average_revenue_per_doctor: 0,
          linked_since: labMarketer.added_at.toISOString(),
        });
        continue;
      }

      // Get all requests from doctors of this marketer to this lab
      const requests = await prisma.request.findMany({
        where: {
          doctor_email: { in: doctorEmails },
          lab_id: labId,
        },
        select: {
          id: true,
          status: true,
          tests: true,
          lab_revenue_amount: true,
        },
      });

      // Calculate metrics
      const incomingCount = requests.filter((r) => r.status === "incoming").length;
      const seenCount = requests.filter((r) => r.status === "seen").length;
      const doneCount = requests.filter((r) => r.status === "done").length;
      const totalCount = requests.length;

      const totalRevenue = requests.reduce(
        (sum, r) => sum + (r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0),
        0
      );

      // Collect all tests
      const testCounts: Record<string, number> = {};
      requests.forEach((r) => {
        if (r.tests) {
          r.tests
            .split(/[,\n]+/)
            .map((t: string) => t.trim())
            .filter(Boolean)
            .forEach((t: string) => {
              testCounts[t] = (testCounts[t] || 0) + 1;
            });
        }
      });

      const conversionRate =
        totalCount > 0 ? Math.round(((seenCount + doneCount) / totalCount) * 100) : 0;
      const completionRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
      const avgRevenuePerRequest = totalCount > 0 ? totalRevenue / totalCount : 0;
      const avgRevenuePerDoctor = doctorCount > 0 ? totalRevenue / doctorCount : 0;

      marketersData.push({
        marketer_id: labMarketer.marketer_id,
        marketer_name: labMarketer.marketer.name,
        marketer_email: labMarketer.marketer.email,
        doctors_count: doctorCount,
        total_requests: totalCount,
        incoming_requests: incomingCount,
        seen_requests: seenCount,
        completed_requests: doneCount,
        conversion_rate: conversionRate,
        completion_rate: completionRate,
        total_revenue: totalRevenue,
        tests: testCounts,
        average_revenue_per_request: avgRevenuePerRequest,
        average_revenue_per_doctor: avgRevenuePerDoctor,
        linked_since: labMarketer.added_at.toISOString(),
      });

      summaryTotalDoctors += doctorCount;
      summaryTotalRequests += totalCount;
      summaryTotalRevenue += totalRevenue;
    }

    return NextResponse.json({
      success: true,
      analytics: marketersData,
      summary: {
        total_marketers: labMarketers.length,
        total_doctors: summaryTotalDoctors,
        total_requests: summaryTotalRequests,
        total_revenue: summaryTotalRevenue,
      },
    });
  } catch (error) {
    console.error("[lab-marketers-analytics]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
