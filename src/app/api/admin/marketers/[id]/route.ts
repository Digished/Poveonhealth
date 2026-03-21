export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireAdmin(request: NextRequest) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  return adminRecord ? user : null;
}

function maskName(name: string): string {
  return name
    .split(" ")
    .map((part) => (part.length > 0 ? part[0] + "*".repeat(Math.max(part.length - 1, 2)) : ""))
    .join(" ");
}

// GET — full marketer detail: info + doctors + their requests
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const marketer = await prisma.marketer.findUnique({ where: { id: params.id } });
    if (!marketer) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const links = await prisma.doctorMarketerLink.findMany({
      where: { marketer_id: marketer.id },
      orderBy: { created_at: "asc" },
    });

    const doctorEmails = links.map((l) => l.doctor_email);

    const requests = doctorEmails.length > 0
      ? await prisma.request.findMany({
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
        })
      : [];

    // Group by doctor email
    const byDoctor = new Map<string, typeof requests>();
    for (const r of requests) {
      if (!byDoctor.has(r.doctor_email)) byDoctor.set(r.doctor_email, []);
      byDoctor.get(r.doctor_email)!.push(r);
    }

    const doctors = links.map((link) => {
      const doctorRequests = byDoctor.get(link.doctor_email) ?? [];
      const first = doctorRequests[doctorRequests.length - 1]; // oldest = first request
      return {
        doctor_email: link.doctor_email,
        doctor_name: first?.doctor_name ?? link.doctor_email,
        doctor_phone: first?.doctor_phone ?? null,
        doctor_hospital: first?.doctor_hospital ?? null,
        total_requests: doctorRequests.length,
        linked_since: link.created_at,
        requests: doctorRequests.map((r) => ({
          id: r.id,
          code: r.code,
          patient_name: maskName(r.patient_name ?? ""),
          tests: r.tests,
          status: r.status,
          created_at: r.created_at,
          seen_at: r.seen_at,
          completed_at: r.completed_at,
        })),
      };
    });

    const stats = {
      total_doctors: links.length,
      total_requests: requests.length,
      pending: requests.filter((r) => r.status === "incoming").length,
      seen: requests.filter((r) => r.status === "seen").length,
      done: requests.filter((r) => r.status === "done").length,
    };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://poveon.vercel.app";

    return NextResponse.json({
      success: true,
      marketer: {
        ...marketer,
        referral_link: `${appUrl}/?ref=${marketer.code}`,
      },
      doctors,
      stats,
    });
  } catch (err) {
    console.error("[admin/marketers/[id] GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH — suspend or unsuspend
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { suspended } = await request.json();
    if (typeof suspended !== "boolean") {
      return NextResponse.json({ error: "suspended must be a boolean" }, { status: 400 });
    }

    const marketer = await prisma.marketer.update({
      where: { id: params.id },
      data: { suspended },
    });

    // If suspending, invalidate all active sessions
    if (suspended) {
      await prisma.marketerSession.deleteMany({ where: { marketer_id: params.id } });
    }

    return NextResponse.json({ success: true, marketer });
  } catch (err) {
    console.error("[admin/marketers/[id] PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE — remove marketer (cascades to links, OTPs, sessions)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    await prisma.marketer.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/marketers/[id] DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
