/**
 * POST /api/requests/patient-create
 *
 * Self-service patient request — no doctor fields required.
 * doctor_name is stored as "Self Service" and doctor_email as null.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { resend, labSender } from "@/lib/email/resend";
import { labNewRequest, patientRequestCode } from "@/lib/email/templates";
import { testsToCategories } from "@/lib/test-categories";
import { resolveTests, totalFromBreakdown } from "@/lib/resolve-tests";
import { logApiCall } from "@/lib/api-logger";
import { sendSms, buildPatientRequestSms } from "@/lib/sms";

const SELF_SERVICE_NAME = "Self Service";

const Schema = z.object({
  lab_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(),
  patient_name: z.string().min(1).max(200),
  patient_phone: z.string().min(5).max(50),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_age: z.number().int().min(0).max(150).optional(),
  tests: z.string().min(1).max(3000),
  additional_notes: z.string().max(1000).optional().or(z.literal("")),
  is_critical: z.boolean().optional().default(false),
  needs_ambulance: z.boolean().optional().default(false),
  ambulance_notes: z.string().max(500).optional().or(z.literal("")),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  const start = Date.now();

  // Log environment check
  console.log("[patient-create] ENV CHECK:");
  console.log(`  - SENDCHAMP_API_KEY set: ${!!process.env.SENDCHAMP_API_KEY}`);
  console.log(`  - RESEND_API_KEY set: ${!!process.env.RESEND_API_KEY}`);

  try {
    const body = await request.json();
    const parsed = Schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: parsed.error.flatten() },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const data = parsed.data;

    const lab = await prisma.lab.findUnique({ where: { id: data.lab_id } });
    if (!lab) {
      return NextResponse.json(
        { success: false, error: "Laboratory not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Rate-limit: max 10 self-service requests per phone per hour
    const recentCount = await prisma.request.count({
      where: {
        patient_phone: data.patient_phone,
        doctor_email: null,
        created_at: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentCount >= 10) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    // Compose the final tests string (combine selections + additional notes)
    const testsField = data.additional_notes
      ? `${data.tests}\n\nAdditional notes: ${data.additional_notes}`
      : data.tests;

    const code = await generateUniqueCode(lab.prefix, async (candidate) => {
      const existing = await prisma.request.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      return !!existing;
    });

    // Resolve tests for pricing (non-blocking fallback)
    let quotedPrice: number | null = null;
    let testBreakdown: unknown = null;
    try {
      const breakdown = await resolveTests(data.tests, data.lab_id);
      quotedPrice = totalFromBreakdown(breakdown);
      testBreakdown = breakdown;
    } catch (e) {
      console.error("[patient-create] resolve-tests failed:", e);
    }

    const newRequest = await prisma.request.create({
      data: {
        code,
        lab_id: data.lab_id,
        branch_id: data.branch_id ?? null,
        patient_name: data.patient_name,
        patient_phone: data.patient_phone,
        patient_email: data.patient_email?.trim() || null,
        // Store age as dob = null; age is included in additional notes or stored as-is
        // The schema has no plain "age" column; we include age in the tests/notes string
        dob: null,
        sex: null,
        address: null,
        doctor_name: SELF_SERVICE_NAME,
        doctor_email: null,
        doctor_prefix: null,
        doctor_phone: null,
        doctor_hospital: null,
        doctor_bank_name: null,
        doctor_account_number: null,
        doctor_account_name: null,
        schedule: null,
        diagnosis: null,
        tests: testsField,
        quoted_price: quotedPrice,
        test_breakdown: testBreakdown ?? undefined,
        is_critical: data.is_critical,
        needs_ambulance: data.needs_ambulance,
        ambulance_notes: data.ambulance_notes || null,
        test_image_url: null,
        status: "incoming",
      },
    });

    const labAddress = lab.address ?? "";
    const labPhones = (lab.phones as { number: string; label: string }[]) ?? [];

    // Notify lab by email (fire-and-forget)
    if (lab.request_email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
      resend.emails.send({
        from: labSender(lab),
        to: lab.request_email,
        subject: `New Self-Service Request`,
        html: labNewRequest({
          labName: lab.name,
          patientName: data.patient_name,
          patientPhone: data.patient_phone,
          doctorName: SELF_SERVICE_NAME,
          tests: testsField,
          isUrgent: data.is_critical || data.needs_ambulance,
          isCritical: data.is_critical,
          needsAmbulance: data.needs_ambulance,
          appUrl,
        }),
      })
        .then(({ error }) => { if (error) console.error("[email] lab self-service:", JSON.stringify(error)); })
        .catch((e) => console.error("[email] lab self-service error:", e));
    }

    // SMS the patient their code (fire-and-forget)
    const patientEmail = data.patient_email?.trim();
    console.log(`[patient-create] SMS: Attempting to send to ${data.patient_phone}`);
    console.log(`[patient-create] EMAIL: Email field = "${patientEmail}"`);

    sendSms(
      data.patient_phone,
      buildPatientRequestSms({ patientName: data.patient_name, labName: lab.name, code })
    ).catch((e) => console.error("[patient-create] SMS send error:", e));

    // Send email to patient if provided (fire-and-forget)
    if (patientEmail) {
      console.log(`[patient-create] EMAIL: Sending to ${patientEmail}`);
      const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const appUrl = envUrl || "https://poveon.com";

      // Fire-and-forget but with proper logging
      (async () => {
        try {
          const result = await resend.emails.send({
            from: labSender(lab),
            to: patientEmail,
            subject: `Your Lab Request Code — ${code}`,
            html: patientRequestCode({
              patientName: data.patient_name,
              code,
              labName: lab.name,
              labAddress: labAddress,
              labPhones: labPhones,
              testCategories: testsToCategories(data.tests),
              requestPageUrl: `${appUrl}/r/${code}`,
            }),
          });

          console.log(`[patient-create] EMAIL: Resend API response:`, JSON.stringify(result));

          if (result.error) {
            console.error(`[patient-create] EMAIL send error:`, JSON.stringify(result.error));
          } else {
            console.log(`[patient-create] ✅ EMAIL sent successfully to ${patientEmail}`);
          }
        } catch (e) {
          console.error(`[patient-create] EMAIL exception:`, e instanceof Error ? e.message : String(e));
        }
      })();
    } else {
      console.log("[patient-create] EMAIL: No email provided, skipping");
    }

    logApiCall({ method: "POST", path: "/api/requests/patient-create", status: 200, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: true, code, requestId: newRequest.id, lab: { name: lab.name, address: labAddress, phones: labPhones } },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[patient-create] error:", error);
    logApiCall({ method: "POST", path: "/api/requests/patient-create", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
