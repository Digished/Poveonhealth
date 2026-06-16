import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { resend, labSender } from "@/lib/email/resend";
import { doctorRequestConfirmation, patientRequestCode, labNewRequest } from "@/lib/email/templates";
import { testsToCategories } from "@/lib/test-categories";
import { resolveTests, totalFromBreakdown } from "@/lib/resolve-tests";
import { logApiCall } from "@/lib/api-logger";
import { sendSms, buildPatientRequestSms } from "@/lib/sms";
import { logSmsSend } from "@/lib/sms/log-sms";
import { isValidNigerianPhone, checkPhoneSmsRateLimit, checkDailySmsCap } from "@/lib/sms-guard";
import { parseReferralText } from "@/lib/parse-referral";

const CreateRequestSchema = z.object({
  patient_name: z.string().min(1).max(200).optional().or(z.literal("")),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional().or(z.literal("")),
  // Age in years — preferred over dob for new requests. Accepts number or numeric string; "" → undefined.
  patient_age: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(0).max(130).optional()
  ),
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
  // Fast Mode: doctor's plain-language input, sorted into fields server-side.
  fast_mode: z.boolean().optional().default(false),
  raw_input: z.string().max(4000).optional().or(z.literal("")),
  // New: resolved tests from KB validation (frontend sends this)
  resolvedTests: z.array(
    z.object({
      input: z.string(),
      canonical: z.string().optional(),
      variant: z.string().optional().nullable(),
      status: z.enum(["resolved", "ambiguous", "unknown"]),
    })
  ).optional(),
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

    // Fast Mode: the doctor sent plain language — sort it into fields here (in the
    // background). Only empty fields are filled, so anything explicitly sent wins.
    const rawInput = (data.raw_input || "").trim();
    if (data.fast_mode && rawInput) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
        const { parsed: p } = await parseReferralText(rawInput, data.lab_id, baseUrl);
        if (!data.patient_name) data.patient_name = p.patient_name;
        if (data.patient_age == null) data.patient_age = p.patient_age ?? undefined;
        if (!data.sex && (p.sex === "male" || p.sex === "female")) data.sex = p.sex;
        if (!data.patient_phone) data.patient_phone = p.patient_phone;
        if (!data.patient_email && p.patient_email) data.patient_email = p.patient_email;
        if (!data.diagnosis) data.diagnosis = p.diagnosis;
        if (!data.tests) data.tests = p.tests.length ? p.tests.join("\n") : rawInput;
      } catch (e) {
        // Sorting failed — still create the request with the raw text as the tests
        // so nothing is lost; the lab gets the original note in the email.
        console.error("[create] fast-mode parse failed:", e);
        if (!data.tests) data.tests = rawInput;
      }

      // Background patient enrichment (cached "step 2"): fill any still-missing
      // patient details from a saved PatientProfile, matched by email then phone.
      try {
        const emailKey = data.patient_email?.trim().toLowerCase();
        const phoneDigits = (data.patient_phone || "").replace(/\D/g, "");
        let profile = emailKey
          ? await prisma.patientProfile.findUnique({ where: { email: emailKey }, select: { name: true, dob: true, sex: true, phone: true } })
          : null;
        if (!profile && phoneDigits.length >= 7) {
          const candidates = await prisma.patientProfile.findMany({
            where: { phone: { not: null } },
            select: { name: true, dob: true, sex: true, phone: true },
          });
          profile = candidates.find((c) => {
            const stored = (c.phone || "").replace(/\D/g, "");
            return stored && (stored === phoneDigits || stored.endsWith(phoneDigits) || phoneDigits.endsWith(stored));
          }) ?? null;
        }
        if (profile) {
          if (!data.patient_name && profile.name) data.patient_name = profile.name;
          if (!data.sex && (profile.sex === "male" || profile.sex === "female")) data.sex = profile.sex;
          if (data.patient_age == null && profile.dob) {
            const d = new Date(profile.dob);
            if (!Number.isNaN(d.getTime())) {
              const now = new Date();
              let age = now.getFullYear() - d.getFullYear();
              const m = now.getMonth() - d.getMonth();
              if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
              if (age >= 0 && age < 130) data.patient_age = age;
            }
          }
        }
      } catch (e) {
        console.error("[create] fast-mode patient enrichment skipped:", e);
      }
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

    // Rate-limit: max 5 requests per doctor email per hour
    const recentCount = await prisma.request.count({
      where: {
        doctor_email: data.doctor_email,
        created_at: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentCount >= 5) {
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

    // Build final tests string from resolved tests or raw tests
    let finalTests = data.tests || "See attached image";
    if (data.resolvedTests && data.resolvedTests.length > 0) {
      // Format resolved tests as newline-separated canonical names
      finalTests = data.resolvedTests
        .filter((t) => t.status === "resolved" || t.status === "ambiguous")
        .map((t) => {
          if (t.canonical) {
            return t.variant ? `${t.canonical} (${t.variant})` : t.canonical;
          }
          return t.input;
        })
        .join("\n");
    }

    // Resolve tests → quoted_price + breakdown (non-blocking fallback to null)
    let quotedPrice: number | null = null;
    let testBreakdown: unknown = null;
    if (finalTests && finalTests !== "See attached image") {
      try {
        const breakdown = await resolveTests(finalTests, data.lab_id);
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
        patient_age: data.patient_age ?? null,
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
        tests: finalTests,
        quoted_price: quotedPrice,
        test_breakdown: testBreakdown ?? undefined,
        is_critical: data.is_critical,
        needs_ambulance: data.needs_ambulance,
        ambulance_notes: data.ambulance_notes || null,
        test_image_url: data.test_image_url || null,
        fast_mode: data.fast_mode ?? false,
        raw_input: rawInput || null,
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

    // If the doctor has a profile but no hospital saved, persist the one they typed so their
    // dashboard reflects it and they are not prompted again on future requests.
    if (doctorProfile && doctorProfile.hospitals.length === 0 && data.doctor_hospital) {
      (async () => {
        try {
          await prisma.doctorProfile.update({
            where: { email: data.doctor_email },
            data: { hospitals: [data.doctor_hospital!] },
          });
        } catch (e) {
          console.error("[doctor-profile] hospital back-fill failed:", e);
        }
      })();
    }

    const labAddress = lab.address ?? "";
    const labPhones = (lab.phones as { number: string; label: string }[]) ?? [];
    // Always brand emails with the lab name (not just when custom email is set)
    const brand = { name: lab.name };

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

    const patientEmail = data.patient_email?.trim();
    if (patientEmail) {
      // Derive the app base URL — env var preferred, fallback to inferred origin
      const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const reqHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
      const reqProto = request.headers.get("x-forwarded-proto") || "https";
      const patientAppUrl = envUrl || (reqHost ? `${reqProto}://${reqHost}` : "");
      sends.push(
        resend.emails.send({
          from: labSender(lab),
          to: patientEmail,
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
      const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const reqHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
      const reqProto = request.headers.get("x-forwarded-proto") || "https";
      const appUrl = envUrl || (reqHost ? `${reqProto}://${reqHost}` : "https://poveon.com");
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
          fastMode: data.fast_mode || undefined,
          rawInput: rawInput || undefined,
          appUrl,
          code,
        }),
      })
        .then(({ error }) => { if (error) console.error("[email] lab new request:", JSON.stringify(error)); })
        .catch((e) => console.error("[email] lab new request error:", e));
    }

    await Promise.all(sends).catch((e) => console.error("[email] send error:", e));

    // Send SMS to patient if phone provided — guarded against pumping fraud
    if (data.patient_phone) {
      const phone = data.patient_phone;
      const smsBody = buildPatientRequestSms({ patientName: data.patient_name ?? "", labName: lab.name, code });

      // Layer 1: must be a valid Nigerian number (blocks international premium-route abuse)
      if (!isValidNigerianPhone(phone)) {
        console.warn(`[api/requests/create] SMS skipped — non-Nigerian phone: ${phone}`);
      } else {
        // Layer 2: per-phone hourly cap (max 3 SMS to same number per hour)
        const phoneLimit = await checkPhoneSmsRateLimit(phone);
        if (!phoneLimit.allowed) {
          console.warn(`[api/requests/create] SMS skipped — phone rate limit (${phoneLimit.count}/hr): ${phone}`);
        } else {
          // Layer 3: global daily circuit breaker
          const daily = await checkDailySmsCap();
          if (!daily.allowed) {
            console.error(`[api/requests/create] SMS blocked — daily cap reached (${daily.count}/${daily.limit})`);
          } else {
            sendSms(phone, smsBody)
              .then(({ messageId }) => logSmsSend({ provider: "termii", toPhone: phone, messageBody: smsBody, messageId, requestId: newRequest.id }))
              .catch((e) => console.error("[api/requests/create] SMS error:", e));
          }
        }
      }
    } else {
      console.log("[api/requests/create] No patient phone provided, SMS skipped");
    }

    logApiCall({ method: "POST", path: "/api/requests/create", status: 200, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: true, code, requestId: newRequest.id, lab: { name: lab.name, address: labAddress, phones: (lab.phones ?? []) as { number: string; label: string }[], whatsapp: lab.whatsapp ?? null } },
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
