export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const adminRecord = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
    if (!adminRecord) {
      return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const labId = searchParams.get("lab_id") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const q = searchParams.get("q")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(200, parseInt(searchParams.get("limit") ?? "50"));
    const skip = (page - 1) * limit;

    // Optional created_at range for the metric counts (YYYY-MM-DD). `to` is
    // treated as inclusive of the whole day.
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    const fromDate = fromParam ? new Date(`${fromParam}T00:00:00.000Z`) : null;
    const toDate = toParam ? new Date(`${toParam}T23:59:59.999Z`) : null;
    const dateFilter =
      (fromDate && !isNaN(fromDate.getTime())) || (toDate && !isNaN(toDate.getTime()))
        ? {
            created_at: {
              ...(fromDate && !isNaN(fromDate.getTime()) ? { gte: fromDate } : {}),
              ...(toDate && !isNaN(toDate.getTime()) ? { lte: toDate } : {}),
            },
          }
        : {};

    const where = {
      ...(labId ? { lab_id: labId } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { patient_name: { contains: q, mode: "insensitive" as const } },
              { tests: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
              { doctor_name: { contains: q, mode: "insensitive" as const } },
              { doctor_email: { contains: q, mode: "insensitive" as const } },
              { patient_phone: { contains: q } },
              { lab: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    // Paginated requests + efficient aggregate counts in parallel
    const [requests, total, incomingCount, seenCount, doneCount, byLabCounts] = await Promise.all([
      prisma.request.findMany({
        where,
        include: { lab: { select: { name: true, address: true } } },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.request.count({ where }),
      prisma.request.count({ where: { status: "incoming", ...dateFilter } }),
      prisma.request.count({ where: { status: "seen", ...dateFilter } }),
      prisma.request.count({ where: { status: "done", ...dateFilter } }),
      prisma.request.groupBy({ by: ["lab_id"], _count: { id: true }, where: dateFilter }),
    ]);

    const labIds = byLabCounts.map((l) => l.lab_id);
    const labs = await prisma.lab.findMany({
      where: { id: { in: labIds } },
      select: { id: true, name: true },
    });
    const labNameMap = Object.fromEntries(labs.map((l) => [l.id, l.name]));

    const byLab = byLabCounts
      .map((l) => ({ lab_id: l.lab_id, lab_name: labNameMap[l.lab_id] ?? l.lab_id, total: l._count.id }))
      .sort((a, b) => b.total - a.total);

    // Enrich requests with live DoctorProfile data
    const doctorEmails = Array.from(new Set(requests.map((r) => r.doctor_email).filter((e): e is string => !!e)));
    const doctorProfiles = await prisma.doctorProfile.findMany({
      where: { email: { in: doctorEmails } },
      select: { email: true, prefix: true, full_name: true, phone: true, hospitals: true, bank_name: true, account_number: true, account_name: true },
    });
    const profileByEmail = new Map(doctorProfiles.map((p) => [p.email, p]));

    const enrichedRequests = requests.map((r) => {
      const lp = r.doctor_email ? profileByEmail.get(r.doctor_email) : undefined;
      // A doctor is "registered" when they have a DoctorProfile on file; otherwise
      // they're tracked from request details alone (unregistered referrer).
      if (!lp) return { ...r, doctor_registered: false };
      return {
        ...r,
        doctor_registered: true,
        doctor_prefix: lp.prefix ?? r.doctor_prefix,
        doctor_name: lp.full_name || r.doctor_name,
        doctor_phone: lp.phone ?? r.doctor_phone,
        doctor_hospital: lp.hospitals[0] ?? r.doctor_hospital,
        doctor_bank_name: lp.bank_name ?? r.doctor_bank_name,
        doctor_account_number: lp.account_number ?? r.doctor_account_number,
        doctor_account_name: lp.account_name ?? r.doctor_account_name,
      };
    });

    return NextResponse.json({
      success: true,
      requests: enrichedRequests,
      total,
      page,
      metrics: {
        total: incomingCount + seenCount + doneCount,
        incoming: incomingCount,
        seen: seenCount,
        done: doneCount,
        byLab,
      },
    });
  } catch (error) {
    console.error("Admin requests error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
