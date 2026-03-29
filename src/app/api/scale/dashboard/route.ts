import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    if (!token) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

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
        marketer: { name: marketer.name, email: marketer.email },
        doctors: [],
        stats: { total_doctors: 0, total_requests: 0, pending: 0, seen: 0, done: 0 },
      });
    }

    const doctorEmails = links.map((l: { doctor_email: string }) => l.doctor_email);

    // Fetch requests and profiles in parallel
    const [requests, profiles] = await Promise.all([
      prisma.request.findMany({
        where: { doctor_email: { in: doctorEmails } },
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
          created_at: true,
          seen_at: true,
          completed_at: true,
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.doctorProfile.findMany({
        where: { email: { in: doctorEmails } },
        select: {
          email: true,
          prefix: true,
          full_name: true,
          phone: true,
          hospitals: true,
          claimed: true,
        },
      }),
    ]);

    const profileMap = new Map((profiles as DoctorProfile[]).map((p) => [p.email, p]));

    // Group requests by doctor email
    const byDoctor = new Map<string, { doctor_name: string; doctor_phone: string | null; doctor_hospital: string | null; requests: typeof requests }>();
    for (const r of requests) {
      if (!byDoctor.has(r.doctor_email)) {
        byDoctor.set(r.doctor_email, {
          doctor_name:     r.doctor_name,
          doctor_phone:    r.doctor_phone,
          doctor_hospital: r.doctor_hospital,
          requests:        [],
        });
      }
      byDoctor.get(r.doctor_email)!.requests.push(r);
    }

    const doctors = links.map((link: { doctor_email: string; created_at: Date }) => {
      const entry   = byDoctor.get(link.doctor_email);
      const profile = profileMap.get(link.doctor_email);

      // Prefer profile data (marketer-filled / doctor-confirmed) over request snapshot
      const displayName = profile?.full_name
        ? `${profile.prefix ? profile.prefix + " " : ""}${profile.full_name}`.trim()
        : (entry?.doctor_name ?? link.doctor_email);

      return {
        doctor_email:        link.doctor_email,
        doctor_name:         displayName,
        doctor_phone:        profile?.phone    ?? entry?.doctor_phone    ?? null,
        doctor_hospital:     profile?.hospitals?.[0] ?? entry?.doctor_hospital ?? null,
        claimed:             profile?.claimed  ?? true,
        total_requests:      entry?.requests.length ?? 0,
        completed_requests:  entry?.requests.filter((r: { status: string }) => r.status === "seen" || r.status === "done").length ?? 0,
        linked_since:        link.created_at,
        requests: (entry?.requests ?? []).map((r: { id: string; code: string; patient_name: string | null; tests: string; status: string; created_at: Date; seen_at: Date | null; completed_at: Date | null }) => ({
          id:           r.id,
          code:         r.code,
          patient_name: maskName(r.patient_name ?? ""),
          tests:        r.tests,
          status:       r.status,
          created_at:   r.created_at,
          seen_at:      r.seen_at,
          completed_at: r.completed_at,
        })),
      };
    });

    const stats = {
      total_doctors:  links.length,
      total_requests: requests.length,
      pending:        requests.filter((r: { status: string }) => r.status === "incoming").length,
      seen:           requests.filter((r: { status: string }) => r.status === "seen").length,
      done:           requests.filter((r: { status: string }) => r.status === "seen" || r.status === "done").length,
    };

    return NextResponse.json({
      success: true,
      marketer: { name: marketer.name, email: marketer.email },
      doctors,
      stats,
    });
  } catch (err) {
    console.error("[scale/dashboard]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
