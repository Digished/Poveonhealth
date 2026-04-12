import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("scale_token")?.value;
    if (!token) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const session = await prisma.marketerSession.findUnique({
      where: { id: token },
      include: { marketer: true },
    });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const marketer = session.marketer;

    // Get all doctors linked to this marketer
    const links = await prisma.doctorMarketerLink.findMany({
      where: { marketer_id: marketer.id },
    });

    if (links.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const doctorEmails = links.map((l) => l.doctor_email);

    // Get labs this marketer is assigned to
    const labMarketerAssignments = await prisma.labMarketer.findMany({
      where: { marketer_id: marketer.id },
      select: { lab_id: true },
    });
    const assignedLabIds = labMarketerAssignments.map((lm) => lm.lab_id);

    // Build WHERE clause for requests
    const requestsWhere = {
      doctor_email: { in: doctorEmails },
      status: { in: ["seen", "done"] }, // Only revenue-generating requests
      ...(assignedLabIds.length > 0 ? { lab_id: { in: assignedLabIds } } : {}),
    };

    // Fetch all revenue requests
    const requests = await prisma.request.findMany({
      where: requestsWhere,
      select: {
        created_at: true,
        lab_revenue_amount: true,
      },
      orderBy: { created_at: "desc" },
    });

    // Group by month and sum revenue
    const monthlyData: Record<string, number> = {};

    for (const req of requests) {
      const date = new Date(req.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = 0;
      }
      monthlyData[monthKey] += req.lab_revenue_amount ? Number(req.lab_revenue_amount) : 0;
    }

    // Convert to sorted array (last 12 months)
    const sortedMonths = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);

    const data = sortedMonths.map(([month, revenue]) => {
      const [year, monthNum] = month.split("-");
      const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      const label = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });

      return { month, label, revenue };
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("[scale/analytics/revenue-chart]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
