export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";

/**
 * GET /api/lab/results/pending
 * Worklist for the Results page: requests that are paid and have had a specimen
 * collected / analysis started, but are not yet fully reported. Each row
 * carries its test breakdown (to derive expected departments) and any results
 * entered so far (to show draft / verified / reported per department).
 */
export async function GET(request: NextRequest) {
  const auth = await getLabAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!auth.permissions.can_view_requests) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const requests = await prisma.request.findMany({
    where: {
      lab_id: auth.lab_id,
      is_paid: true,
      status: { notIn: ["done"] },
      journey_events: { some: { stage: { in: ["collected", "received", "in_analysis", "verified"] } } },
    },
    orderBy: { created_at: "desc" },
    take: 200,
    select: {
      id: true,
      code: true,
      status: true,
      current_stage: true,
      patient_name: true,
      patient_phone: true,
      patient_email: true,
      patient_age: true,
      sex: true,
      doctor_name: true,
      doctor_email: true,
      tests: true,
      test_breakdown: true,
      created_at: true,
      results: {
        select: { id: true, department: true, status: true, template_id: true, kind: true, updated_at: true },
      },
    },
  });

  return NextResponse.json({ requests });
}
