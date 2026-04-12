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
      orderBy: { created_at: "asc" },
    });

    if (links.length === 0) {
      return NextResponse.json({
        success: true,
        metrics: {
          total_doctors: 0,
          total_requests: 0,
          completed_requests: 0,
          total_revenue: 0,
        },
        doctors: [],
        requests: [],
      });
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
      ...(assignedLabIds.length > 0 ? { lab_id: { in: assignedLabIds } } : {}),
    };

    // Fetch requests and doctor profiles in parallel
    const [requests, profiles] = await Promise.all([
      prisma.request.findMany({
        where: requestsWhere,
        select: {
          id: true,
          code: true,
          doctor_email: true,
          patient_name: true,
          tests: true,
          status: true,
          lab_revenue_amount: true,
          created_at: true,
          seen_at: true,
          completed_at: true,
          lab: { select: { id: true, name: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.doctorProfile.findMany({
        where: { email: { in: doctorEmails } },
        select: { email: true, prefix: true, full_name: true, phone: true, hospitals: true },
      }),
    ]);

    const profileMap = new Map(profiles.map((p) => [p.email, p]));

    // Group requests by doctor
    type ReqRow = typeof requests[number];
    const byDoctor = new Map<string, ReqRow[]>();
    for (const r of requests) {
      if (!r.doctor_email) continue;
      if (!byDoctor.has(r.doctor_email)) {
        byDoctor.set(r.doctor_email, []);
      }
      byDoctor.get(r.doctor_email)!.push(r);
    }

    const isRevenue = (status: string) => status === "seen" || status === "done";

    // Build doctors list with performance metrics
    const doctors = links.map((link) => {
      const profile = profileMap.get(link.doctor_email);
      const reqs = byDoctor.get(link.doctor_email) ?? [];

      const displayName = profile?.full_name
        ? `${profile.prefix ? profile.prefix + " " : ""}${profile.full_name}`.trim()
        : link.doctor_email;

      const completedRequests = reqs.filter((r) => isRevenue(r.status)).length;
      const totalRevenue = reqs
        .filter((r) => isRevenue(r.status))
        .reduce((sum, r) => sum + (r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0), 0);

      const lastRequest = reqs.length > 0 ? reqs[0].created_at : null;

      return {
        doctor_email: link.doctor_email,
        doctor_name: displayName,
        doctor_phone: profile?.phone ?? null,
        hospitals: profile?.hospitals?.length ? profile.hospitals : [],
        total_requests: reqs.length,
        completed_requests: completedRequests,
        total_revenue: totalRevenue,
        last_request_date: lastRequest,
        linked_since: link.created_at,
      };
    });

    // Calculate aggregate metrics
    const total_revenue = requests
      .filter((r) => isRevenue(r.status))
      .reduce((sum, r) => sum + (r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0), 0);

    const metrics = {
      total_doctors: links.length,
      total_requests: requests.length,
      completed_requests: requests.filter((r) => isRevenue(r.status)).length,
      total_revenue,
    };

    return NextResponse.json({
      success: true,
      metrics,
      doctors,
      requests: requests.map((r) => ({
        id: r.id,
        code: r.code,
        doctor_email: r.doctor_email,
        status: r.status,
        lab_name: r.lab?.name ?? null,
        created_at: r.created_at,
        completed_at: r.completed_at,
        lab_revenue_amount: r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0,
      })),
    });
  } catch (err) {
    console.error("[scale/analytics/dashboard]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
