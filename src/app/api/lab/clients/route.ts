export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getLabAuth } from "@/lib/lab-auth";
import { prisma } from "@/lib/prisma";
import { jsonWithEtag, makeEtag, notModified } from "@/lib/http-cache";

// The clients tab groups requests per patient and shows a visit history of
// date / status / tests / diagnosis / slip image — nothing else. Selecting just
// those keeps a whole-history response from carrying every column of every row.
const CLIENT_REQUEST_SELECT = {
  id: true,
  code: true,
  status: true,
  source: true,
  tests: true,
  diagnosis: true,
  test_image_url: true,
  patient_name: true,
  patient_phone: true,
  patient_email: true,
  created_at: true,
} as const;

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

    // A client is anyone who physically registered: every walk-in / QR
    // self-registration (regardless of pipeline status) plus seen/done Poveon
    // requests. Pre-arrival Poveon leads (incoming) are excluded as noise.
    const arrivedClient = {
      OR: [
        { status: { in: ["seen", "done"] } },
        { source: { in: ["walk_in", "qr"] } },
      ],
    };

    // Version probe first — the tab is re-opened far more often than the
    // underlying requests change.
    const freshness = await prisma.request.aggregate({
      where: { lab_id: auth.lab_id, ...arrivedClient },
      _count: { _all: true },
      _max: { updated_at: true },
    });
    const etag = makeEtag(["lab-clients", auth.lab_id, freshness._count._all, freshness._max.updated_at]);
    const cached = notModified(request, etag);
    if (cached) return cached;

    // Fetch all arrived clients with a phone on file.
    const requests = await prisma.request.findMany({
      where: {
        lab_id: auth.lab_id,
        patient_phone: { not: null },
        ...arrivedClient,
      },
      orderBy: { created_at: "desc" },
      select: CLIENT_REQUEST_SELECT,
    });

    // Also include arrived clients without phone (grouped by email if available)
    const requestsNoPhone = await prisma.request.findMany({
      where: {
        lab_id: auth.lab_id,
        patient_phone: null,
        patient_email: { not: null },
        ...arrivedClient,
      },
      orderBy: { created_at: "desc" },
      select: CLIENT_REQUEST_SELECT,
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

    return jsonWithEtag({ success: true, clients }, etag);
  } catch (error) {
    console.error("Lab clients fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to load clients" }, { status: 500 });
  }
}
