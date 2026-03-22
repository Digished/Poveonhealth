export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await prisma.adminUser.findUnique({ where: { user_id: user.id } });
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const labId = params.id;
  const { searchParams } = new URL(request.url);
  const monthFilter = searchParams.get("month");
  const statusFilter = searchParams.get("status");
  const testFilter = searchParams.get("test")?.toLowerCase();

  const allRequests = await prisma.request.findMany({
    where: { lab_id: labId },
    select: {
      id: true,
      code: true,
      status: true,
      tests: true,
      diagnosis: true,
      sex: true,
      dob: true,
      schedule: true,
      created_at: true,
      patient_name: true,
      doctor_name: true,
      doctor_prefix: true,
      doctor_email: true,
    },
    orderBy: { created_at: "desc" },
  });

  // Apply filters
  const filtered = allRequests.filter((r) => {
    if (monthFilter && r.created_at.toISOString().slice(0, 7) !== monthFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (testFilter) {
      const tests = r.tests ? r.tests.split(/[,\n]+/).map((t) => t.trim().toLowerCase()) : [];
      if (!tests.some((t) => t.includes(testFilter))) return false;
    }
    return true;
  });

  // Monthly counts by status
  const monthlyStatus: Record<string, { incoming: number; seen: number; done: number; total: number }> = {};
  allRequests.forEach((r) => {
    const key = r.created_at.toISOString().slice(0, 7);
    if (!monthlyStatus[key]) monthlyStatus[key] = { incoming: 0, seen: 0, done: 0, total: 0 };
    if (r.status in monthlyStatus[key]) monthlyStatus[key][r.status as "incoming" | "seen" | "done"]++;
    monthlyStatus[key].total++;
  });

  // Test counts from filtered set
  const testCounts: Record<string, { total: number; done: number }> = {};
  filtered.forEach((r) => {
    if (!r.tests || r.tests === "See attached image") return;
    r.tests.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean).forEach((t) => {
      if (!testCounts[t]) testCounts[t] = { total: 0, done: 0 };
      testCounts[t].total++;
      if (r.status === "done") testCounts[t].done++;
    });
  });
  const topTests = Object.entries(testCounts)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 20)
    .map(([name, c]) => ({ name, total: c.total, done: c.done }));

  // Top doctors by referral count
  const doctorMap: Record<string, { name: string; email: string; prefix: string | null; total: number; done: number }> = {};
  allRequests.forEach((r) => {
    const key = r.doctor_email;
    if (!doctorMap[key]) doctorMap[key] = { name: r.doctor_name, email: r.doctor_email, prefix: r.doctor_prefix, total: 0, done: 0 };
    doctorMap[key].total++;
    if (r.status === "done") doctorMap[key].done++;
  });
  const topDoctors = Object.values(doctorMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Sex demographics
  const sexCounts: Record<string, number> = {};
  filtered.forEach((r) => {
    const s = (r.sex ?? "unknown").toLowerCase();
    const key = ["male", "female"].includes(s) ? s : "unknown";
    sexCounts[key] = (sexCounts[key] ?? 0) + 1;
  });

  // Schedule preferences
  const schedCounts: Record<string, number> = { today: 0, this_week: 0, this_month: 0, not_sure: 0 };
  filtered.forEach((r) => {
    const s = r.schedule ?? "not_sure";
    if (s in schedCounts) schedCounts[s]++;
  });

  const total = filtered.length;
  const done = filtered.filter((r) => r.status === "done").length;
  const seen = filtered.filter((r) => r.status === "seen").length;
  const incoming = filtered.filter((r) => r.status === "incoming").length;

  // Available filter options
  const availableMonths = Array.from(new Set(allRequests.map((r) => r.created_at.toISOString().slice(0, 7)))).sort().reverse();
  const availableTests = Array.from(new Set(
    allRequests.flatMap((r) => r.tests && r.tests !== "See attached image"
      ? r.tests.split(/[,\n]+/).map((t) => t.trim()).filter(Boolean)
      : [])
  )).sort();

  return NextResponse.json({
    success: true,
    total,
    done,
    seen,
    incoming,
    completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
    monthlyStatus,
    topTests,
    topDoctors,
    sexCounts,
    schedCounts,
    availableMonths,
    availableTests,
  });
}
