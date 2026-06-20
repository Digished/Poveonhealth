export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";

// Normalize to digits only for phone grouping (handles +234 vs 0234 vs 234 etc.)
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Use last 10 digits as canonical key (strips country code variations)
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

    // Fetch all requests where patient code was entered (seen/done)
    const requests = await prisma.request.findMany({
      where: {
        lab_id: auth.lab_id,
        status: { in: ["seen", "done"] },
        patient_phone: { not: null },
      },
      orderBy: { created_at: "desc" },
    });

    // Also include seen/done requests without phone (grouped by email if available)
    const requestsNoPhone = await prisma.request.findMany({
      where: {
        lab_id: auth.lab_id,
        status: { in: ["seen", "done"] },
        patient_phone: null,
        patient_email: { not: null },
      },
      orderBy: { created_at: "desc" },
    });

    // Group by normalized phone key — merges same patient across format variations
    const clientMap = new Map<string, {
      patient_phone: string;       // display phone (from most recent request)
      patient_email: string | null;
      patient_name: string | null;
      visit_count: number;
      first_visit: string;
      last_visit: string;
      recent_tests: string;
      requests: typeof requests;
    }>();

    // Process phone-having requests (newest first)
    for (const req of requests) {
      const key = normalizePhone(req.patient_phone!);
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          patient_phone: req.patient_phone!,
          patient_email: req.patient_email ?? null,
          patient_name: req.patient_name ?? null,
          visit_count: 1,
          first_visit: req.created_at.toISOString(),
          last_visit: req.created_at.toISOString(),
          recent_tests: req.tests,
          requests: [req],
        });
      } else {
        const existing = clientMap.get(key)!;
        existing.visit_count += 1;
        existing.first_visit = req.created_at.toISOString();
        if (!existing.patient_name && req.patient_name) existing.patient_name = req.patient_name;
        if (!existing.patient_email && req.patient_email) existing.patient_email = req.patient_email;
        existing.requests.push(req);
      }
    }

    // Process email-only requests
    for (const req of requestsNoPhone) {
      const key = `email:${req.patient_email!.toLowerCase()}`;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          patient_phone: "",
          patient_email: req.patient_email!,
          patient_name: req.patient_name ?? null,
          visit_count: 1,
          first_visit: req.created_at.toISOString(),
          last_visit: req.created_at.toISOString(),
          recent_tests: req.tests,
          requests: [req],
        });
      } else {
        const existing = clientMap.get(key)!;
        existing.visit_count += 1;
        existing.first_visit = req.created_at.toISOString();
        if (!existing.patient_name && req.patient_name) existing.patient_name = req.patient_name;
        existing.requests.push(req);
      }
    }

    // Enrich names from PatientProfile (patient self-service > doctor-entered name)
    const emails = Array.from(clientMap.values())
      .map((c) => c.patient_email)
      .filter(Boolean) as string[];

    if (emails.length > 0) {
      const profiles = await prisma.patientProfile.findMany({
        where: { email: { in: emails.map((e) => e.toLowerCase()) } },
        select: { email: true, name: true, phone: true },
      });
      const profileByEmail = new Map(profiles.map((p) => [p.email, p]));

      clientMap.forEach((client) => {
        if (!client.patient_email) return;
        const profile = profileByEmail.get(client.patient_email.toLowerCase());
        if (profile?.name) client.patient_name = profile.name;
      });
    }

    const clientList: { patient_phone: string; patient_email: string | null; patient_name: string | null; visit_count: number; first_visit: string; last_visit: string; recent_tests: string; source: string; requests: typeof requests }[] = [];
    // Each client's source = its most recent request's source (requests are newest-first).
    clientMap.forEach((v) => clientList.push({ ...v, source: v.requests[0]?.source ?? "poveon" }));
    const clients = clientList.sort((a, b) => new Date(b.last_visit).getTime() - new Date(a.last_visit).getTime());

    return NextResponse.json({ success: true, clients });
  } catch (error) {
    console.error("Lab clients fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load clients" }, { status: 500 });
  }
}
