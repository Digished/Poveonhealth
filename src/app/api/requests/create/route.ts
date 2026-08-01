import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { resend, labSender, labRequestRecipients, FROM_ADDRESS } from "@/lib/email/resend";
import { doctorRequestConfirmation, patientRequestCode, labNewRequest, marketerNewRequest } from "@/lib/email/templates";
import { testsToCategories } from "@/lib/test-categories";
import { resolveTests, totalFromBreakdown, type ResolvedTest } from "@/lib/resolve-tests";
import { logApiCall } from "@/lib/api-logger";
import { buildPatientRequestSms } from "@/lib/sms";
import { notify } from "@/lib/notify";
import { waTemplates } from "@/lib/whatsapp";
import { parseReferralText } from "@/lib/parse-referral";
import { ensureProfessional } from "@/lib/lims";
import { hasMinLetters, MIN_NAME_LETTERS } from "@/lib/name-validation";
import { redeemFreeRide } from "@/lib/rides";

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
  // Free-ride perk redemption (doctor offers the patient a free ride to the lab).
  free_ride: z.boolean().optional().default(false),
  free_ride_perk_id: z.string().uuid().optional(),
  ride_pickup_address: z.string().max(500).optional().or(z.literal("")),
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

    // Fast Mode: the doctor sent plain language. The AI sorting, pricing, row
    // update and emails are all DEFERRED to after the response (see below) so the
    // code is generated and returned immediately. This helper sorts the raw text
    // into `data` and enriches from a saved patient profile; it runs in the bg.
    const rawInput = (data.raw_input || "").trim();

    // Cached "step 2": fill still-missing patient details from a saved profile.
    const fillPatientFromProfile = async () => {
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
    };

    // Full Fast Mode sort (no client-side test chips): the LLM splits tests AND
    // patient details out of the raw text, then we fill from a saved profile.
    const enrichFromRawInput = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
        const { parsed: p } = await parseReferralText(rawInput, data.lab_id, baseUrl);
        if (!data.patient_name) data.patient_name = p.patient_name;
        if (data.patient_age == null) data.patient_age = p.patient_age ?? undefined;
        if (!data.sex && (p.sex === "male" || p.sex === "female")) data.sex = p.sex;
        if (!data.patient_phone) data.patient_phone = p.patient_phone;
        if (!data.patient_email && p.patient_email) data.patient_email = p.patient_email;
        if (!data.diagnosis) data.diagnosis = p.diagnosis;
        data.tests = p.tests.length ? p.tests.join("\n") : rawInput;
      } catch (e) {
        console.error("[create] fast-mode parse failed:", e);
        if (!data.tests) data.tests = rawInput;
      }
      await fillPatientFromProfile();
    };

    // Tests that aren't in this lab's catalogue — surfaced to the lab in their
    // notification email so they can accept/price or reject them.
    let offCatalogTests: string[] = [];
    const offCatalogFromBreakdown = (breakdown: ResolvedTest[]): string[] => {
      const names = breakdown
        .filter((b) => b.is_others)
        .map((b) => (b.raw && b.raw !== b.canonical_name ? `${b.raw} → ${b.canonical_name}` : b.canonical_name).trim())
        .filter(Boolean);
      return Array.from(new Set(names));
    };

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

    // Labs need to know who referred the patient: after merging with the saved
    // profile, the doctor's name and hospital must each contain at least 4
    // letters or the request is rejected.
    if (!hasMinLetters(doctorName)) {
      return NextResponse.json(
        { success: false, error: `Referring doctor's full name is required (at least ${MIN_NAME_LETTERS} letters).` },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (!hasMinLetters(doctorHospital)) {
      return NextResponse.json(
        { success: false, error: `Referring hospital / clinic is required (at least ${MIN_NAME_LETTERS} letters).` },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Fast Mode requests must always carry the patient's phone number so the
    // lab can reach the patient.
    if (data.fast_mode && (data.patient_phone || "").replace(/\D/g, "").length < 7) {
      return NextResponse.json(
        { success: false, error: "Patient's phone number is required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

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

    // Build final tests string. For Fast Mode the AI sorting is deferred, so we
    // store the raw text now and refine + price it in the background.
    let finalTests = data.tests || rawInput || "See attached image";
    if (!data.fast_mode && data.resolvedTests && data.resolvedTests.length > 0) {
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

    // Resolve tests → quoted_price + breakdown. Skipped for Fast Mode (done in bg).
    let quotedPrice: number | null = null;
    let testBreakdown: unknown = null;
    if (!data.fast_mode && finalTests && finalTests !== "See attached image") {
      try {
        const breakdown = await resolveTests(finalTests, data.lab_id);
        quotedPrice = totalFromBreakdown(breakdown);
        testBreakdown = breakdown;
        offCatalogTests = offCatalogFromBreakdown(breakdown);
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

    // Any referring doctor becomes a saved professional in this lab, so they're
    // searchable during client registration. Fire-and-forget; never blocks.
    ensureProfessional({
      labId: data.lab_id,
      name: doctorName,
      email: data.doctor_email,
      phone: doctorPhone,
      hospital: doctorHospital,
    }).catch(() => {});

    // Marketer attribution + notification — fire-and-forget, never blocks the request.
    // Covers both newly-linked (first-touch via pov_ref) and already-linked doctors:
    // any request by a doctor in a marketer's network emails that marketer.
    (async () => {
      try {
        let link = await prisma.doctorMarketerLink.findUnique({
          where: { doctor_email: data.doctor_email },
        });
        if (!link && povRef) {
          const m = await prisma.marketer.findUnique({ where: { code: povRef } });
          if (m) {
            link = await prisma.doctorMarketerLink.create({
              data: {
                doctor_email: data.doctor_email,
                marketer_id: m.id,
                first_request_id: newRequest.id,
              },
            });
          }
        }
        if (!link) return;

        const marketer = await prisma.marketer.findUnique({ where: { id: link.marketer_id } });
        if (!marketer || marketer.suspended || !marketer.email) return;

        const lab = await prisma.lab.findUnique({ where: { id: data.lab_id }, select: { name: true } });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: marketer.email,
          subject: `${doctorName || "A doctor"} in your network sent a request`,
          html: marketerNewRequest({
            marketerName: marketer.name,
            doctorName: doctorName || data.doctor_email,
            labName: lab?.name ?? "",
            tests: finalTests,
            code,
            dashboardUrl: `${appUrl}/scale/dashboard`,
          }),
        });
      } catch (e) {
        console.error("[marketer-attribution]", e);
      }
    })();

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
    const envUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const reqHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const reqProto = request.headers.get("x-forwarded-proto") || "https";
    const appUrl = envUrl || (reqHost ? `${reqProto}://${reqHost}` : "https://poveon.com");

    // Send the confirmation/notification emails + patient SMS. Reads the latest
    // `data` (after any Fast Mode sorting). Failures are logged, never thrown.
    const sendNotifications = async () => {
      const sends: Promise<void>[] = [
        resend.emails.send({
          from: labSender(lab),
          to: data.doctor_email,
          subject: `Lab Request Confirmed — Code: ${code}`,
          html: doctorRequestConfirmation({
            doctorName: doctorName || "Medical Professional",
            patientName: data.patient_name || "Patient",
            code, labName: lab.name, labAddress, labPhones,
            tests: data.tests || "See attached image",
            brand,
          }),
        }).then(({ error }) => { if (error) console.error("[email] doctor confirmation:", JSON.stringify(error)); }),
      ];

      const patientEmail = data.patient_email?.trim();
      if (patientEmail) {
        sends.push(
          resend.emails.send({
            from: labSender(lab),
            to: patientEmail,
            subject: `Your Lab Request Code — ${code}`,
            html: patientRequestCode({
              patientName: data.patient_name || "",
              code, labName: lab.name, labAddress, labPhones,
              testCategories: testsToCategories(data.tests || ""),
              brand,
              requestPageUrl: appUrl ? `${appUrl}/r/${code}` : undefined,
            }),
          }).then(({ error }) => { if (error) console.error("[email] patient code:", JSON.stringify(error)); })
        );
      }

      const requestRecipients = labRequestRecipients(lab);
      if (requestRecipients.length > 0) {
        const isUrgent = data.needs_ambulance || data.is_critical;
        sends.push(
          resend.emails.send({
            from: labSender(lab),
            to: requestRecipients,
            subject: `New Lab Request${isUrgent ? " — URGENT" : ""}`,
            html: labNewRequest({
              labName: lab.name,
              patientName: data.patient_name || "",
              patientPhone: data.patient_phone || undefined,
              doctorName: doctorName || "Medical Professional",
              doctorPhone: doctorPhone || undefined,
              doctorHospital: doctorHospital || undefined,
              tests: data.tests || "See attached image",
              offCatalogTests: offCatalogTests.length > 0 ? offCatalogTests : undefined,
              diagnosis: data.diagnosis || undefined,
              schedule: data.schedule || undefined,
              isUrgent,
              isCritical: data.is_critical,
              needsAmbulance: data.needs_ambulance,
              ambulanceNotes: data.ambulance_notes || undefined,
              testImageUrl: data.test_image_url || undefined,
              fastMode: data.fast_mode || undefined,
              rawInput: rawInput || undefined,
              appUrl, code,
            }),
          }).then(({ error }) => { if (error) console.error("[email] lab new request:", JSON.stringify(error)); })
        );
      }

      await Promise.all(sends).catch((e) => console.error("[email] send error:", e));

      const requestUrl = appUrl ? `${appUrl}/r/${code}` : undefined;

      // Patient: code + lab address on WhatsApp, falling back to SMS.
      if (data.patient_phone) {
        await notify({
          phone: data.patient_phone,
          whatsapp: waTemplates.patientRequestCode({
            patientName: data.patient_name,
            labName: lab.name,
            labAddress,
            labPhones,
            code,
            requestUrl,
          }),
          sms: buildPatientRequestSms({ patientName: data.patient_name ?? "", labName: lab.name, code }),
          smsRateLimit: true,
          requestId: newRequest.id,
          tag: "request-code",
        });
      }

      // Doctor: WhatsApp confirmation alongside the email above. No SMS fallback —
      // doctors have always been reached by email, and this must not add SMS spend.
      if (doctorPhone) {
        await notify({
          phone: doctorPhone,
          whatsapp: waTemplates.doctorRequestConfirmation({
            doctorName,
            patientName: data.patient_name,
            labName: lab.name,
            labAddress,
            labPhones,
            code,
            requestUrl,
          }),
          requestId: newRequest.id,
          tag: "doctor-request",
        });
      }
    };

    if (data.fast_mode) {
      // Fast Mode: the code + row are already created. Now sort the text, price
      // it, update the row and send the emails/SMS. This is AWAITED (not fired in
      // the background) because this runtime has no waitUntil/after primitive —
      // a background task would be killed once the response is sent, so the
      // emails would never go out.
      if (rawInput) {
        await enrichFromRawInput();
        finalTests = data.tests || rawInput;
        let qp: number | null = null;
        let tb: unknown = null;
        try {
          const breakdown = await resolveTests(finalTests, data.lab_id);
          qp = totalFromBreakdown(breakdown);
          tb = breakdown;
          offCatalogTests = offCatalogFromBreakdown(breakdown);
        } catch (e) { console.error("[resolve-tests] fast-mode:", e); }
        await prisma.request.update({
          where: { id: newRequest.id },
          data: {
            patient_name: data.patient_name || null,
            patient_age: data.patient_age ?? null,
            sex: data.sex || null,
            patient_email: data.patient_email || null,
            patient_phone: data.patient_phone || null,
            diagnosis: data.diagnosis || null,
            tests: finalTests,
            quoted_price: qp,
            test_breakdown: tb ?? undefined,
          },
        }).catch((e) => console.error("[create] fast-mode update failed:", e));
      }
      await sendNotifications();
    } else {
      await sendNotifications();
    }

    // Free-ride perk: if the doctor opted to offer a ride and holds an active
    // perk for this lab, redeem it now (creates the ride + notifies patient, lab
    // and the assigned logistics partner). Awaited because this runtime has no
    // post-response background primitive; failures never block the request.
    let freeRideRedeemed = false;
    if (data.free_ride) {
      const pickup = (data.ride_pickup_address || "").trim();
      const patientPhone = (data.patient_phone || "").trim();
      const patientName = (data.patient_name || "").trim();
      const patientEmail = (data.patient_email || "").trim();

      // Login-code gate: only redeem when a valid doctor session (set by the PIN
      // step) matches this doctor's email. Prevents redeeming someone else's perk.
      const docToken = request.cookies.get("doc_token")?.value;
      let doctorAuthed = false;
      if (docToken) {
        const sess = await prisma.doctorSession.findUnique({ where: { id: docToken } }).catch(() => null);
        doctorAuthed = !!sess && sess.expires_at > new Date() && sess.doctor_email === data.doctor_email.trim().toLowerCase();
      }

      if (!doctorAuthed) {
        console.warn("[create] free_ride requested without a valid doctor login — skipped");
      } else if (pickup && patientPhone && patientName && patientEmail) {
        // The patient's email is required — the arrival code is delivered there.
        const ride = await redeemFreeRide({
          perkId: data.free_ride_perk_id ?? null,
          doctorEmail: data.doctor_email,
          labId: data.lab_id,
          requestId: newRequest.id,
          patientName,
          patientPhone,
          pickupAddress: pickup,
          labName: lab.name,
          labAddress,
        }).catch((e) => { console.error("[create] free-ride redeem failed:", e); return null; });
        freeRideRedeemed = !!ride;
      } else {
        console.warn("[create] free_ride requested but missing pickup/patient name/phone/email — skipped");
      }
    }

    logApiCall({ method: "POST", path: "/api/requests/create", status: 200, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: true, code, requestId: newRequest.id, free_ride_redeemed: freeRideRedeemed, lab: { name: lab.name, address: labAddress, phones: (lab.phones ?? []) as { number: string; label: string }[], whatsapp: lab.whatsapp ?? null } },
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
