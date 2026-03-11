import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { resend, labSender } from "@/lib/email/resend";
import { doctorRequestConfirmation, patientRequestCode } from "@/lib/email/templates";
import { logApiCall } from "@/lib/api-logger";

const CreateRequestSchema = z.object({
  patient_name: z.string().min(2).max(200),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  sex: z.enum(["male", "female"]),
  address: z.string().max(500).optional().or(z.literal("")),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_phone: z.string().max(50).optional().or(z.literal("")),
  doctor_prefix: z.string().max(30).optional().or(z.literal("")),
  doctor_name: z.string().min(2).max(200),
  doctor_email: z.string().email(),
  doctor_phone: z.string().max(50).optional().or(z.literal("")),
  doctor_hospital: z.string().max(200).optional().or(z.literal("")),
  doctor_bank_name: z.string().max(100).optional().or(z.literal("")),
  doctor_account_number: z.string().max(20).optional().or(z.literal("")),
  doctor_account_name: z.string().max(200).optional().or(z.literal("")),
  schedule: z.enum(["today", "this_week", "this_month", "not_sure"]).optional(),
  diagnosis: z.string().max(2000).optional().or(z.literal("")),
  tests: z.string().min(2).max(2000),
  lab_id: z.string().uuid(),
});

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

    // Insert the request
    await prisma.request.create({
      data: {
        code,
        lab_id: data.lab_id,
        patient_name: data.patient_name,
        dob: new Date(data.dob),
        sex: data.sex,
        address: data.address || null,
        patient_email: data.patient_email || null,
        patient_phone: data.patient_phone || null,
        doctor_prefix: data.doctor_prefix || null,
        doctor_name: data.doctor_name,
        doctor_email: data.doctor_email,
        doctor_phone: data.doctor_phone || null,
        doctor_hospital: data.doctor_hospital || null,
        doctor_bank_name: data.doctor_bank_name || null,
        doctor_account_number: data.doctor_account_number || null,
        doctor_account_name: data.doctor_account_name || null,
        schedule: data.schedule || null,
        diagnosis: data.diagnosis || null,
        tests: data.tests,
        status: "incoming",
      },
    });

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
          doctorName: data.doctor_name,
          patientName: data.patient_name,
          code,
          labName: lab.name,
          labAddress,
          labPhones,
          tests: data.tests,
          brand,
        }),
      }).then(({ error }) => { if (error) console.error("[email] doctor confirmation:", JSON.stringify(error)); }),
    ];

    if (data.patient_email) {
      sends.push(
        resend.emails.send({
          from: labSender(lab),
          to: data.patient_email,
          subject: `Your Lab Request Code — ${code}`,
          html: patientRequestCode({
            patientName: data.patient_name,
            code,
            labName: lab.name,
            labAddress,
            labPhones,
            brand,
          }),
        }).then(({ error }) => { if (error) console.error("[email] patient code:", JSON.stringify(error)); })
      );
    }

    await Promise.all(sends).catch((e) => console.error("[email] send error:", e));

    logApiCall({ method: "POST", path: "/api/requests/create", status: 200, duration_ms: Date.now() - start });
    return NextResponse.json({
      success: true,
      code,
      lab: { name: lab.name, address: labAddress, phones: labPhones },
    });
  } catch (error) {
    console.error("Create request error:", error);
    logApiCall({ method: "POST", path: "/api/requests/create", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
