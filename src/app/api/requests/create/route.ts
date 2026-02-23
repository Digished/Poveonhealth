import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import {
  doctorRequestConfirmation,
  patientRequestCode,
} from "@/lib/email/templates";

const CreateRequestSchema = z.object({
  patient_name: z.string().min(2).max(200),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  sex: z.enum(["male", "female"]),
  address: z.string().max(500).optional().or(z.literal("")),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_phone: z.string().max(50).optional().or(z.literal("")),
  doctor_name: z.string().min(2).max(200),
  doctor_email: z.string().email(),
  doctor_phone: z.string().max(50).optional().or(z.literal("")),
  diagnosis: z.string().max(2000).optional().or(z.literal("")),
  tests: z.string().min(2).max(2000),
  lab_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
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
        doctor_name: data.doctor_name,
        doctor_email: data.doctor_email,
        doctor_phone: data.doctor_phone || null,
        diagnosis: data.diagnosis || null,
        tests: data.tests,
        status: "incoming",
      },
    });

    const labAddress = lab.address ?? "";
    const labPhones = (lab.phones as string[]) ?? [];

    // Send emails — failures are logged but never block the request response
    const sends: Promise<void>[] = [
      resend.emails.send({
        from: FROM_ADDRESS,
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
        }),
      }).then(({ error }) => { if (error) console.error("[email] doctor confirmation:", JSON.stringify(error)); }),
    ];

    if (data.patient_email) {
      sends.push(
        resend.emails.send({
          from: FROM_ADDRESS,
          to: data.patient_email,
          subject: `Your Lab Request Code — ${code}`,
          html: patientRequestCode({
            patientName: data.patient_name,
            code,
            labName: lab.name,
            labAddress,
            labPhones,
          }),
        }).then(({ error }) => { if (error) console.error("[email] patient code:", JSON.stringify(error)); })
      );
    }

    await Promise.all(sends).catch((e) => console.error("[email] send error:", e));

    return NextResponse.json({
      success: true,
      code,
      lab: { name: lab.name, address: labAddress, phones: labPhones },
    });
  } catch (error) {
    console.error("Create request error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
