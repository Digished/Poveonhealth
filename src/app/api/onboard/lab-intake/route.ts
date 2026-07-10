/**
 * POST /api/onboard/lab-intake
 *
 * Public client onboarding for a lab — used by the QR-code intake form
 * (`/o/[labSlug]`) and the dashboard "Register walk-in" flow. Creates an
 * `incoming` request tagged with its source, records consent, seeds the
 * `registered` journey event, and upserts the patient profile. QR
 * self-registrations also notify the lab (dashboard queue + email) and the
 * patient (email confirmation).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { resolveTests, totalFromBreakdown } from "@/lib/resolve-tests";
import { seedDepartmentTracks } from "@/lib/lims";
import { logApiCall } from "@/lib/api-logger";
import { resend, FROM_ADDRESS, labSender } from "@/lib/email/resend";
import { labQueueRegistration, patientQueueJoined } from "@/lib/email/templates";

const Schema = z.object({
  lab_slug: z.string().min(1).max(120).optional(),
  lab_id: z.string().uuid().optional(),
  source: z.enum(["qr", "walk_in"]).default("qr"),
  patient_name: z.string().min(1).max(200),
  patient_phone: z.string().min(5).max(50),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_age: z.number().int().min(0).max(150).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  sex: z.string().max(20).optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
  tests: z.string().min(1).max(3000),
  condition: z.string().max(1000).optional().or(z.literal("")),
  professional_id: z.string().uuid().optional(),
  // ── QR self-service queue intake fields ──────────────────────────────────
  referral_type: z.enum(["self", "doctor", "hmo"]).optional(),
  whatsapp_phone: z.string().max(50).optional().or(z.literal("")),
  referring_doctor_name: z.string().max(200).optional().or(z.literal("")),
  referring_org: z.string().max(200).optional().or(z.literal("")),
  policy_number: z.string().max(100).optional().or(z.literal("")),
  payment_mode: z.enum(["cash", "card", "transfer", "bill_hospital"]).optional(),
  consent: z.literal(true),
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function ageFromDob(dob: string): number | null {
  const d = new Date(dob + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age <= 150 ? age : null;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
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

    if (!data.lab_id && !data.lab_slug) {
      return NextResponse.json({ success: false, error: "Lab not specified" }, { status: 400, headers: CORS_HEADERS });
    }

    const lab = data.lab_id
      ? await prisma.lab.findUnique({ where: { id: data.lab_id } })
      : await prisma.lab.findUnique({ where: { slug: data.lab_slug! } });
    if (!lab) {
      return NextResponse.json({ success: false, error: "Laboratory not found" }, { status: 404, headers: CORS_HEADERS });
    }

    // Rate-limit QR self-registration: max 3 per phone per hour for this lab.
    if (data.source === "qr") {
      const recent = await prisma.request.count({
        where: { lab_id: lab.id, patient_phone: data.patient_phone, source: "qr", created_at: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
      });
      if (recent >= 3) {
        return NextResponse.json({ success: false, error: "Too many submissions. Please try again later." }, { status: 429, headers: CORS_HEADERS });
      }
    }

    const testsField = data.condition ? `${data.tests}\n\nNotes: ${data.condition}` : data.tests;

    const code = await generateUniqueCode(lab.prefix, async (candidate) => {
      const existing = await prisma.request.findUnique({ where: { code: candidate }, select: { id: true } });
      return !!existing;
    });

    let quotedPrice: number | null = null;
    let testBreakdown: unknown = null;
    try {
      const breakdown = await resolveTests(data.tests, lab.id);
      quotedPrice = totalFromBreakdown(breakdown);
      testBreakdown = breakdown;
    } catch (e) {
      console.error("[lab-intake] resolve-tests failed:", e);
    }

    const email = data.patient_email?.trim() || null;
    // The self-service queue notifies patients by email, so QR intake requires one.
    if (data.source === "qr" && !email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400, headers: CORS_HEADERS });
    }
    const dob = data.dob?.trim() || null;
    const patientAge = data.patient_age ?? (dob ? ageFromDob(dob) : null);

    // A chosen referring doctor (from the lab's pool) makes this a referral —
    // otherwise fall back to the free-text doctor/organisation the client typed.
    let doctorName =
      data.source === "walk_in" ? "Walk-in"
      : data.referral_type === "doctor" ? "Doctor Referral"
      : data.referral_type === "hmo" ? "HMO Referral"
      : "Self Service";
    let doctorEmail: string | null = null;
    let doctorPhone: string | null = null;
    let doctorHospital: string | null = data.referring_org?.trim() || null;
    if (data.professional_id) {
      const prof = await prisma.labProfessional.findFirst({
        where: { id: data.professional_id, lab_id: lab.id, active: true },
        select: { name: true, email: true, phone: true, hospital: true },
      });
      if (prof) {
        doctorName = prof.name;
        doctorEmail = prof.email ?? null;
        doctorPhone = prof.phone ?? null;
        doctorHospital = prof.hospital ?? doctorHospital;
      }
    } else if (data.referring_doctor_name?.trim()) {
      doctorName = data.referring_doctor_name.trim();
    }

    const newRequest = await prisma.request.create({
      data: {
        code,
        lab_id: lab.id,
        patient_name: data.patient_name,
        patient_phone: data.patient_phone,
        patient_email: email,
        patient_age: patientAge,
        dob: dob ? new Date(dob + "T00:00:00Z") : null,
        sex: data.sex || null,
        address: data.address || null,
        doctor_name: doctorName,
        doctor_email: doctorEmail,
        doctor_phone: doctorPhone,
        doctor_hospital: doctorHospital,
        tests: testsField,
        diagnosis: data.condition || null,
        quoted_price: quotedPrice,
        test_breakdown: testBreakdown ?? undefined,
        status: "incoming",
        source: data.source,
        referral_type: data.referral_type ?? null,
        policy_number: data.policy_number?.trim() || null,
        whatsapp_phone: data.whatsapp_phone?.trim() || null,
        payment_mode: data.payment_mode ?? null,
        // QR self-registrations join the waiting queue immediately — the lab
        // edits/adjusts details on the queue itself rather than pre-approving.
        queue_confirmed_at: data.source === "qr" ? new Date() : null,
        current_stage: "registered",
        consent_at: new Date(),
      },
    });

    // Seed one "registered" journey event per department the request touches.
    await seedDepartmentTracks({ requestId: newRequest.id, labId: newRequest.lab_id, testBreakdown: testBreakdown }).catch(() => {});

    // Upsert the global patient profile for future auto-fill (non-fatal).
    if (email) {
      prisma.patientProfile
        .upsert({
          where: { email },
          create: { email, name: data.patient_name, phone: data.patient_phone, sex: data.sex || null, address: data.address || null },
          update: { name: data.patient_name, phone: data.patient_phone, ...(data.sex ? { sex: data.sex } : {}), ...(data.address ? { address: data.address } : {}) },
        })
        .catch((e) => console.error("[lab-intake] patient upsert failed:", e));
    }

    // QR self-registration → notify the lab and the patient by email
    // (fire-and-forget; the dashboard queue polls for the on-screen alert).
    if (data.source === "qr") {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com";
      const labTo = lab.request_email || lab.email;
      if (labTo) {
        resend.emails
          .send({
            from: FROM_ADDRESS,
            to: labTo,
            subject: `🧾 New self-service registration — ${data.patient_name} (${code})`,
            html: labQueueRegistration({
              labName: lab.name,
              patientName: data.patient_name,
              patientPhone: data.patient_phone,
              whatsappPhone: data.whatsapp_phone?.trim() || null,
              patientEmail: email,
              patientAge,
              sex: data.sex || null,
              referralType: data.referral_type ?? null,
              doctorName: data.referral_type && data.referral_type !== "self" ? doctorName : null,
              referringOrg: doctorHospital,
              policyNumber: data.policy_number?.trim() || null,
              complaint: data.condition || null,
              paymentMode: data.payment_mode ?? null,
              tests: data.tests,
              code,
              appUrl,
            }),
          })
          .then(({ error }) => { if (error) console.error("[lab-intake] lab email:", JSON.stringify(error)); })
          .catch((e) => console.error("[lab-intake] lab email failed:", e));
      }
      if (email) {
        resend.emails
          .send({
            from: labSender(lab),
            to: email,
            subject: `You're registered at ${lab.name} — code ${code}`,
            html: patientQueueJoined({
              patientName: data.patient_name,
              labName: lab.name,
              code,
              tests: data.tests,
              brand: lab.notification_email ? { name: lab.name } : undefined,
            }),
          })
          .then(({ error }) => { if (error) console.error("[lab-intake] patient email:", JSON.stringify(error)); })
          .catch((e) => console.error("[lab-intake] patient email failed:", e));
      }
    }

    logApiCall({ method: "POST", path: "/api/onboard/lab-intake", status: 200, lab_id: lab.id, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: true, code, requestId: newRequest.id, lab: { name: lab.name, address: lab.address } },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[lab-intake] error:", error);
    logApiCall({ method: "POST", path: "/api/onboard/lab-intake", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500, headers: CORS_HEADERS });
  }
}
