export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!auth.permissions.can_view_referrals) {
    return NextResponse.json({ error: "You do not have permission to view referrals" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const monthFilter = searchParams.get("month"); // e.g. "2024-03"
  const testFilter = searchParams.get("test")?.toLowerCase();

  // Fetch all non-incoming requests for this lab (seen/done have confirmed patient arrival)
  const requests = await prisma.request.findMany({
    where: {
      lab_id: auth.lab_id,
      status: { in: ["seen", "done"] },
    },
    select: {
      id: true,
      code: true,
      status: true,
      doctor_name: true,
      doctor_email: true,
      doctor_prefix: true,
      doctor_phone: true,
      doctor_hospital: true,
      doctor_bank_name: true,
      doctor_account_number: true,
      doctor_account_name: true,
      tests: true,
      test_image_url: true,
      created_at: true,
      patient_name: true,
      patient_phone: true,
    },
    orderBy: { created_at: "desc" },
  });

  // Filter by month/test if provided
  let filtered = requests;

  if (monthFilter) {
    filtered = filtered.filter((r) => {
      const d = new Date(r.created_at);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return ym === monthFilter;
    });
  }

  if (testFilter) {
    filtered = filtered.filter((r) =>
      r.tests.toLowerCase().includes(testFilter)
    );
  }

  // Group by doctor email
  const doctorMap = new Map<string, {
    doctor_name: string;
    doctor_email: string;
    doctor_prefix: string | null;
    doctor_phone: string | null;
    doctor_hospital: string | null;
    doctor_bank_name: string | null;
    doctor_account_number: string | null;
    doctor_account_name: string | null;
    total_referrals: number;
    months: Record<string, number>;
    tests: Set<string>;
    last_referral: string;
    recent_requests: { id: string; code: string; status: string; tests: string; test_image_url: string | null; created_at: string; patient_name: string | null; patient_phone: string | null }[];
  }>();

  for (const r of filtered) {
    if (!r.doctor_email) continue; // skip self-service patient requests
    const key = r.doctor_email;
    const d = new Date(r.created_at);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    if (!doctorMap.has(key)) {
      doctorMap.set(key, {
        doctor_name: r.doctor_name,
        doctor_email: r.doctor_email,
        doctor_prefix: r.doctor_prefix,
        doctor_phone: r.doctor_phone,
        doctor_hospital: r.doctor_hospital,
        doctor_bank_name: r.doctor_bank_name,
        doctor_account_number: r.doctor_account_number,
        doctor_account_name: r.doctor_account_name,
        total_referrals: 0,
        months: {},
        tests: new Set(),
        last_referral: r.created_at.toISOString(),
        recent_requests: [],
      });
    }

    const doc = doctorMap.get(key)!;
    doc.total_referrals += 1;
    doc.months[ym] = (doc.months[ym] ?? 0) + 1;

    // Split tests (could be comma-separated or newline-separated)
    const testList = r.tests.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
    testList.forEach((t) => doc.tests.add(t));

    if (r.created_at.toISOString() > doc.last_referral) {
      doc.last_referral = r.created_at.toISOString();
    }

    // Keep the 5 most recent requests (already ordered desc)
    // Keep all requests (not just 5) so the popup can show full history
    doc.recent_requests.push({
      id: r.id,
      code: r.code,
      status: r.status,
      tests: r.tests,
      test_image_url: r.test_image_url,
      created_at: r.created_at.toISOString(),
      patient_name: r.patient_name,
      patient_phone: r.patient_phone,
    });
  }

  // Enrich with live DoctorProfile data for each unique doctor email
  const uniqueEmails = Array.from(doctorMap.keys());
  const profiles = await prisma.doctorProfile.findMany({
    where: { email: { in: uniqueEmails } },
    select: { email: true, prefix: true, full_name: true, phone: true, hospitals: true, bank_name: true, account_number: true, account_name: true },
  });
  const profileMap = new Map(profiles.map((p) => [p.email, p]));

  const referrals = Array.from(doctorMap.values())
    .sort((a, b) => b.total_referrals - a.total_referrals)
    .map((d) => {
      const liveProfile = profileMap.get(d.doctor_email);
      return {
        ...d,
        // Live profile overrides stored request data
        doctor_name: liveProfile?.full_name || d.doctor_name,
        doctor_prefix: liveProfile?.prefix || d.doctor_prefix,
        doctor_phone: liveProfile?.phone || d.doctor_phone,
        doctor_hospital: liveProfile?.hospitals[0] || d.doctor_hospital,
        doctor_bank_name: liveProfile?.bank_name || d.doctor_bank_name,
        doctor_account_number: liveProfile?.account_number || d.doctor_account_number,
        doctor_account_name: liveProfile?.account_name || d.doctor_account_name,
        profile_complete: !!(liveProfile?.full_name),
        tests: Array.from(d.tests).sort(),
        recent_requests: d.recent_requests,
      };
    });

  // Build available filter options from ALL requests (not just filtered)
  const allMonths = new Set<string>();
  const allTests = new Set<string>();

  for (const r of requests) {
    const d = new Date(r.created_at);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    allMonths.add(ym);
    r.tests.split(/[,\n]/).map((t) => t.trim()).filter(Boolean).forEach((t) => allTests.add(t));
  }

  return NextResponse.json({
    success: true,
    referrals,
    available_months: Array.from(allMonths).sort().reverse(),
    available_tests: Array.from(allTests).sort(),
  });
}
