import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { resend, labSender } from "@/lib/email/resend";
import { doctorRequestConfirmation, patientRequestCode, labNewRequest } from "@/lib/email/templates";
import { testsToCategories } from "@/lib/test-categories";
import { resolveTests, totalFromBreakdown } from "@/lib/resolve-tests";
import { logApiCall } from "@/lib/api-logger";

const CreateRequestSchema = z.object({
  patient_name: z.string().min(1).max(200).optional().or(z.literal("")),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional().or(z.literal("")),
  sex: z.enum(["male", "female"]).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_phone: z.string().max(50).optional().or(z.literal("")),
  // Doctor fields — only email is required; others are pulled from DoctorProfile if omitted
  doctor_prefix: z.string().max(30).optional().or(z.literal("")),
  doctor_name: z.string().max(200).optional().or(z.literal("")),
  doctor_email: z.string().email(),
  doctor_phone: z.string().max(50).optional().or(z.literal("")),
  doctor_hospital: z.string().max(200).optional().or(z.literal("")),
  doctor_bank_name: z.string().max(100).optional().or(z.literal("")),
  doctor_account_number: z.string().max(20).optional().or(z.literal("")),
  doctor_account_name: z.string().max(200).optional().or(z.literal("")),
  schedule: z.enum(["today", "this_week", "this_month", "not_sure"]).optional(),
  diagnosis: z.string().max(2000).optional().or(z.literal("")),
  tests: z.string().max(2000).optional().or(z.literal("")),
  lab_id: z.string().uuid(),
  branch_id: z.string().uuid().optional(),
  is_critical: z.boolean().optional().default(false),
  needs_ambulance: z.boolean().optional().default(false),
  ambulance_notes: z.string().max(500).optional().or(z.literal("")),
  test_image_url: z.string().url().optional().or(z.literal("")),
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
  try {
    const body = await request.json();
    const parsed = CreateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Verify the selected lab exists
    const lab = await prisma.lab.findUnique({ where: { id: data.lab_id } });
    if (!lab) {
      return NextResponse.json(
        { success: false, error: "Selected laboratory not found" },
        { status: 404 }
      );
    }

    // Enrich doctor fields from DoctorProfile if not provided in the request body
    const doctorProfile = await prisma.doctorProfile.findUnique({
      where: { email: data.doctor_email },
      select: { prefix: true, full_name: true, phone: true, hospitals: true, bank_name: true, account_number: true, account_name: true },
    });
    const doctorPrefix = data.doctor_prefix || doctorProfile?.prefix || null;
    const doctorName = data.doctor_name || doctorProfile?.full_name || "";
    const doctorPhone = data.doctor_phone || doctorProfile?.phone || null;
    const doctorHospital = data.doctor_hospital || doctorProfile?.hospitals[0] || null;
    const doctorBankName = data.doctor_bank_name || doctorProfile?.bank_name || null;
    const doctorAccountNumber = data.doctor_account_number || doctorProfile?.account_number || null;
    const doctorAccountName = data.doctor_account_name || doctorProfile?.account_name || null;

    // Rate-limit: max 20 requests per doctor email per hour
    const recentCount = await prisma.request.count({
      where: {
        doctor_email: data.doctor_email,
        created_at: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentCount >= 20) {
      return NextResponse.json(
        { success: false, error: "Too many requests submitted. Please try again later." },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    // Generate a unique code for this lab
    const code = await generateUniqueCode(
      lab.prefix,
      async (candidate) => {
        const existing = await prisma.request.findUnique({
          where: { code: candidate },
          select: { id: true },
        });
        return !!existing;
      }
    );

    // Resolve marketer attribution from pov_ref cookie (first-touch, non-blocking)
    const povRef = request.cookies.get("pov_ref")?.value;

    // Resolve tests → quoted_price + breakdown (non-blocking fallback to null)
    let quotedPrice: number | null = null;
    let testBreakdown: unknown = null;
    if (data.tests && data.tests !== "See attached image") {
      try {
        const breakdown = await resolveTests(data.tests, data.lab_id);
        quotedPrice = totalFromBreakdown(breakdown);
        testBreakdown = breakdown;
      } catch (e) {
        console.error("[resolve-tests] failed at creation:", e);
      }
    }

    // Insert the request
    const newRequest = await prisma.request.create({
      data: {
        code,
        lab_id: data.lab_id,
        branch_id: data.branch_id || null,
        patient_name: data.patient_name || null,
        dob: data.dob ? new Date(data.dob) : null,
        sex: data.sex || null,
        address: data.address || null,
        patient_email: data.patient_email || null,
        patient_phone: data.patient_phone || null,
        doctor_prefix: doctorPrefix,
        doctor_name: doctorName,
        doctor_email: data.doctor_email,
        doctor_phone: doctorPhone,
        doctor_hospital: doctorHospital,
        doctor_bank_name: doctorBankName,
        doctor_account_number: doctorAccountNumber,
        doctor_account_name: doctorAccountName,
        schedule: data.schedule || null,
        diagnosis: data.diagnosis || null,
        tests: data.tests || "See attached image",
        quoted_price: quotedPrice,
        test_breakdown: testBreakdown ?? undefined,
        is_critical: data.is_critical,
        needs_ambulance: data.needs_ambulance,
        ambulance_notes: data.ambulance_notes || null,
        test_image_url: data.test_image_url || null,
        status: "incoming",
      },
    });

    // Marketer attribution — fire-and-forget, never blocks or fails the request
    if (povRef) {
      (async () => {
        try {
          const marketer = await prisma.marketer.findUnique({ where: { code: povRef } });
          if (!marketer) return;
          const existing = await prisma.doctorMarketerLink.findUnique({
            where: { doctor_email: data.doctor_email },
          });
          if (!existing) {
            await prisma.doctorMarketerLink.create({
              data: {
                doctor_email: data.doctor_email,
                marketer_id: marketer.id,
                first_request_id: newRequest.id,
              },
            });
          }
        } catch (e) {
          console.error("[marketer-attribution]", e);
        }
      })();
    }

    const labAddress = lab.address ?? "";
    const labPhones = (lab.phones as string[]) ?? [];
    const brand = lab.notification_email ? { name: lab.name } : undefined;

    // Send emails — failures are logged but never block the request response
    const sends: Promise<void>[] = [
      resend.emails.send({
        from: labSender(lab),
        to: data.doctor_email,
        subject: `Lab Request Confirmed — Code: ${code}`,
        html: doctorRequestConfirmation({
          doctorName: doctorName || "Medical Professional",
          patientName: data.patient_name || "Patient",
          code,
          labName: lab.name,
          labAddress,
          labPhones,
          tests: data.tests || "See attached image",
          brand,
        }),
      }).then(({ error }) => { if (error) console.error("[email] doctor confirmation:", JSON.stringify(error)); }),
    ];

    if (data.patient_email) {
      // Derive the app base URL — env var preferred, fallback to inferred origin
      const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const reqHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
      const reqProto = request.headers.get("x-forwarded-proto") || "https";
      const patientAppUrl = envUrl || (reqHost ? `${reqProto}://${reqHost}` : "");
      sends.push(
        resend.emails.send({
          from: labSender(lab),
          to: data.patient_email,
          subject: `Your Lab Request Code — ${code}`,
          html: patientRequestCode({
            patientName: data.patient_name || "",
            code,
            labName: lab.name,
            labAddress,
            labPhones,
            testCategories: testsToCategories(data.tests || ""),
            brand,
            requestPageUrl: patientAppUrl ? `${patientAppUrl}/r/${code}` : undefined,
          }),
        }).then(({ error }) => { if (error) console.error("[email] patient code:", JSON.stringify(error)); })
      );
    }

    // Send new-request notification to the lab's request_email (fire-and-forget)
    if (lab.request_email) {
      const isUrgent = data.needs_ambulance || data.is_critical;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      resend.emails.send({
        from: labSender(lab),
        to: lab.request_email,
        subject: `New Lab Request${isUrgent ? " — URGENT" : ""}`,
        html: labNewRequest({
          labName: lab.name,
          patientName: data.patient_name || "",
          patientPhone: data.patient_phone || undefined,
          doctorName: doctorName || "Medical Professional",
          doctorPhone: doctorPhone || undefined,
          doctorHospital: doctorHospital || undefined,
          tests: data.tests || "See attached image",
          diagnosis: data.diagnosis || undefined,
          schedule: data.schedule || undefined,
          isUrgent,
          isCritical: data.is_critical,
          needsAmbulance: data.needs_ambulance,
          ambulanceNotes: data.ambulance_notes || undefined,
          testImageUrl: data.test_image_url || undefined,
          appUrl,
        }),
      })
        .then(({ error }) => { if (error) console.error("[email] lab new request:", JSON.stringify(error)); })
        .catch((e) => console.error("[email] lab new request error:", e));
    }

    await Promise.all(sends).catch((e) => console.error("[email] send error:", e));

    logApiCall({ method: "POST", path: "/api/requests/create", status: 200, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: true, code, requestId: newRequest.id, lab: { name: lab.name, address: labAddress } },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("Create request error:", error);
    logApiCall({ method: "POST", path: "/api/requests/create", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
