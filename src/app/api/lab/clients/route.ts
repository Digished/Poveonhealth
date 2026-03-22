export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

    // Fetch all requests for this lab where code was entered (status seen/done)
    const requests = await prisma.request.findMany({
      where: {
        lab_id: auth.lab_id,
        status: { in: ["seen", "done"] },
        patient_phone: { not: null },
      },
      orderBy: { created_at: "desc" },
    });

    // Aggregate by patient_phone
    const clientMap = new Map<string, {
      patient_phone: string;
      patient_name: string | null;
      visit_count: number;
      first_visit: string;
      last_visit: string;
      recent_tests: string;
      requests: typeof requests;
    }>();

    // requests are already ordered newest-first
    for (const req of requests) {
      const phone = req.patient_phone!;
      if (!clientMap.has(phone)) {
        clientMap.set(phone, {
          patient_phone: phone,
          patient_name: req.patient_name ?? null,
          visit_count: 1,
          first_visit: req.created_at.toISOString(),
          last_visit: req.created_at.toISOString(),
          recent_tests: req.tests,
          requests: [req],
        });
      } else {
        const existing = clientMap.get(phone)!;
        existing.visit_count += 1;
        // Since records are newest-first, first_visit = last item's created_at
        existing.first_visit = req.created_at.toISOString();
        // Prefer non-null patient_name from most recent (already set on first encounter)
        if (!existing.patient_name && req.patient_name) {
          existing.patient_name = req.patient_name;
        }
        existing.requests.push(req);
      }
    }

    const clients = Array.from(clientMap.values()).sort(
      (a, b) => new Date(b.last_visit).getTime() - new Date(a.last_visit).getTime()
    );

    return NextResponse.json({ success: true, clients });
  } catch (error) {
    console.error("Lab clients fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load clients" }, { status: 500 });
  }
}
