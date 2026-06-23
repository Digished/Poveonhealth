import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DoctorProfile = {
  email:     string;
  prefix:    string | null;
  full_name: string | null;
  phone:     string | null;
  hospitals: string[];
  claimed:   boolean;
};

function maskName(name: string): string {
  return name
    .split(" ")
    .map((part) => (part.length > 0 ? part[0] + "*".repeat(Math.max(part.length - 1, 2)) : ""))
    .join(" ");
}

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

    const links = await prisma.doctorMarketerLink.findMany({
      where: { marketer_id: marketer.id },
      orderBy: { created_at: "asc" },
    });

    if (links.length === 0) {
      return NextResponse.json({
        success: true,
        marketer: { name: marketer.name, email: marketer.email, code: marketer.code },
        doctors: [],
        stats: { total_doctors: 0, total_requests: 0, pending: 0, seen: 0, done: 0, total_revenue: 0 },
      });
    }

    const doctorEmails = links.map((l: { doctor_email: string }) => l.doctor_email);

    // Get labs this marketer is assigned to
    const labMarketerAssignments = await prisma.labMarketer.findMany({
      where: { marketer_id: marketer.id },
      select: { lab_id: true },
    });
    const assignedLabIds = labMarketerAssignments.map((lm) => lm.lab_id);

    // Build the WHERE clause for requests
    // If marketer has no assigned labs, they see ALL their doctors' requests (legacy /scale behavior)
    // If marketer has assigned labs, they ONLY see requests to their assigned labs
    const requestsWhere = {
      doctor_email: { in: doctorEmails },
      ...(assignedLabIds.length > 0 ? { lab_id: { in: assignedLabIds } } : {}),
    };

    const [requests, profiles] = await Promise.all([
      prisma.request.findMany({
        where: requestsWhere,
        select: {
          id: true,
          code: true,
          doctor_name: true,
          doctor_email: true,
          doctor_phone: true,
          doctor_hospital: true,
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
        select: { email: true, prefix: true, full_name: true, phone: true, hospitals: true, claimed: true },
      }),
    ]);

    const profileMap = new Map((profiles as DoctorProfile[]).map((p) => [p.email, p]));

    type ReqRow = typeof requests[number];
    const byDoctor = new Map<string, { doctor_name: string; doctor_phone: string | null; doctor_hospital: string | null; requests: ReqRow[] }>();
    for (const r of requests) {
      if (!r.doctor_email) continue; // skip self-service patient requests
      if (!byDoctor.has(r.doctor_email)) {
        byDoctor.set(r.doctor_email, { doctor_name: r.doctor_name, doctor_phone: r.doctor_phone, doctor_hospital: r.doctor_hospital, requests: [] });
      }
      byDoctor.get(r.doctor_email)!.requests.push(r);
    }

    const isRevenue = (status: string) => status === "seen" || status === "done";

    const doctors = links.map((link: { doctor_email: string; created_at: Date }) => {
      const entry   = byDoctor.get(link.doctor_email);
      const profile = profileMap.get(link.doctor_email);

      const displayName = profile?.full_name
        ? `${profile.prefix ? profile.prefix + " " : ""}${profile.full_name}`.trim()
        : (entry?.doctor_name ?? link.doctor_email);

      const reqs = entry?.requests ?? [];
      const total_revenue = reqs
        .filter((r) => isRevenue(r.status))
        .reduce((sum, r) => sum + (r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0), 0);

      return {
        doctor_email:        link.doctor_email,
        doctor_name:         displayName,
        doctor_phone:        profile?.phone ?? entry?.doctor_phone ?? null,
        hospitals:           profile?.hospitals?.length ? profile.hospitals : (entry?.doctor_hospital ? [entry.doctor_hospital] : []),
        claimed:             profile?.claimed ?? true,
        total_requests:      reqs.length,
        completed_requests:  reqs.filter((r) => isRevenue(r.status)).length,
        total_revenue,
        linked_since:        link.created_at,
        requests: reqs.map((r) => ({
          id:                 r.id,
          code:               r.code,
          patient_name:       maskName(r.patient_name ?? ""),
          tests:              r.tests,
          status:             r.status,
          lab_revenue_amount: r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0,
          created_at:         r.created_at,
          seen_at:            r.seen_at,
          completed_at:       r.completed_at,
          lab_id:             r.lab?.id ?? null,
          lab_name:           r.lab?.name ?? null,
        })),
      };
    });

    const total_revenue = requests
      .filter((r) => isRevenue(r.status))
      .reduce((sum, r) => sum + (r.lab_revenue_amount ? Number(r.lab_revenue_amount) : 0), 0);

    const stats = {
      total_doctors:  links.length,
      total_requests: requests.length,
      pending:        requests.filter((r) => r.status === "incoming").length,
      seen:           requests.filter((r) => r.status === "seen").length,
      done:           requests.filter((r) => isRevenue(r.status)).length,
      total_revenue,
    };

    return NextResponse.json({ success: true, marketer: { name: marketer.name, email: marketer.email, code: marketer.code }, doctors, stats });
  } catch (err) {
    console.error("[scale/dashboard]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
