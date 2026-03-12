import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    // Get all doctor-marketer links for this marketer
    const links = await prisma.doctorMarketerLink.findMany({
      where: { marketer_id: marketer.id },
      orderBy: { created_at: "asc" },
    });

    if (links.length === 0) {
      return NextResponse.json({
        success: true,
        marketer: { name: marketer.name, email: marketer.email, code: marketer.code },
        doctors: [],
        stats: { total_doctors: 0, total_requests: 0, pending: 0, seen: 0, done: 0 },
      });
    }

    const doctorEmails = links.map((l) => l.doctor_email);

    // Fetch all requests for these doctors
    const requests = await prisma.request.findMany({
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
    });

    // Group requests by doctor email
    const byDoctor = new Map<
      string,
      {
        doctor_name: string;
        doctor_email: string;
        doctor_phone: string | null;
        doctor_hospital: string | null;
        requests: typeof requests;
      }
    >();

    for (const r of requests) {
      if (!byDoctor.has(r.doctor_email)) {
        byDoctor.set(r.doctor_email, {
          doctor_name: r.doctor_name,
          doctor_email: r.doctor_email,
          doctor_phone: r.doctor_phone,
          doctor_hospital: r.doctor_hospital,
          requests: [],
        });
      }
      byDoctor.get(r.doctor_email)!.requests.push(r);
    }

    // Build doctor list preserving the link order, include doctors with no requests yet
    const doctors = links.map((link) => {
      const entry = byDoctor.get(link.doctor_email);
      return {
        doctor_email: link.doctor_email,
        doctor_name: entry?.doctor_name ?? link.doctor_email,
        doctor_phone: entry?.doctor_phone ?? null,
        doctor_hospital: entry?.doctor_hospital ?? null,
        total_requests: entry?.requests.length ?? 0,
        linked_since: link.created_at,
        requests: (entry?.requests ?? []).map((r) => ({
          id: r.id,
          code: r.code,
          patient_name: maskName(r.patient_name),
          tests: r.tests,
          status: r.status,
          created_at: r.created_at,
          seen_at: r.seen_at,
          completed_at: r.completed_at,
        })),
      };
    });

    const allRequests = requests;
    const stats = {
      total_doctors: links.length,
      total_requests: allRequests.length,
      pending: allRequests.filter((r) => r.status === "incoming").length,
      seen: allRequests.filter((r) => r.status === "seen").length,
      done: allRequests.filter((r) => r.status === "done").length,
    };

    return NextResponse.json({
      success: true,
      marketer: { name: marketer.name, email: marketer.email, code: marketer.code },
      doctors,
      stats,
    });
  } catch (err) {
    console.error("[scale/dashboard]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
