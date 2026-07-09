export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/journey
 * Lists this lab's requests with their journey timeline for the journey map.
 * Optional query: ?stage=<stage>&source=<source>&limit=<n>
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get("stage");
  const source = searchParams.get("source");
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 300);

  const requests = await prisma.request.findMany({
    where: {
      lab_id: auth.lab_id,
      ...(stage ? { current_stage: stage } : {}),
      ...(source ? { source } : {}),
    },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      code: true,
      status: true,
      source: true,
      current_stage: true,
      patient_name: true,
      patient_phone: true,
      patient_email: true,
      patient_age: true,
      sex: true,
      doctor_prefix: true,
      doctor_name: true,
      doctor_email: true,
      doctor_phone: true,
      doctor_hospital: true,
      is_paid: true,
      tests_confirmed: true,
      tests: true,
      raw_input: true,
      diagnosis: true,
      created_at: true,
      seen_at: true,
      completed_at: true,
      arrived_at: true,
      attended_at: true,
      referral_type: true,
      whatsapp_phone: true,
      payment_mode: true,
      test_breakdown: true,
      journey_events: {
        orderBy: { created_at: "asc" },
        select: { id: true, stage: true, department: true, sample_label: true, note: true, actor_email: true, created_at: true },
      },
    },
  });

  return NextResponse.json({ requests });
}
