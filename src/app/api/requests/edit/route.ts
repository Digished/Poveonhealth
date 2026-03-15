import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const EditRequestSchema = z.object({
  requestId: z.string().uuid(),
  patient_name: z.string().min(2).max(200),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  sex: z.enum(["male", "female"]),
  address: z.string().max(500).optional().or(z.literal("")),
  patient_email: z.string().email().optional().or(z.literal("")),
  patient_phone: z.string().max(50).optional().or(z.literal("")),
  doctor_prefix: z.string().max(30).optional().or(z.literal("")),
  doctor_name: z.string().min(2).max(200),
  doctor_phone: z.string().max(50).optional().or(z.literal("")),
  doctor_hospital: z.string().max(200).optional().or(z.literal("")),
  doctor_bank_name: z.string().max(100).optional().or(z.literal("")),
  doctor_account_number: z.string().max(20).optional().or(z.literal("")),
  doctor_account_name: z.string().max(200).optional().or(z.literal("")),
  schedule: z.enum(["today", "this_week", "this_month", "not_sure"]).optional(),
  diagnosis: z.string().max(2000).optional().or(z.literal("")),
  tests: z.string().min(2).max(2000),
});

export async function PATCH(request: NextRequest) {
  try {
    // Authenticate via doctor session cookie
    const token = request.cookies.get("doc_token")?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
    }

    const session = await prisma.doctorSession.findUnique({ where: { id: token } });
    if (!session || session.expires_at < new Date()) {
      return NextResponse.json({ success: false, error: "Session expired. Please log in again." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = EditRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Fetch the existing request and verify ownership + editability
    const existing = await prisma.request.findUnique({
      where: { id: data.requestId },
      select: { id: true, status: true, doctor_email: true },
    });

    if (!existing) {
      return NextResponse.json({ success: false, error: "Request not found." }, { status: 404 });
    }

    if (existing.doctor_email !== session.doctor_email) {
      return NextResponse.json({ success: false, error: "You do not have permission to edit this request." }, { status: 403 });
    }

    if (existing.status !== "incoming") {
      return NextResponse.json(
        { success: false, error: "This request can no longer be edited — it has already been processed by the laboratory." },
        { status: 409 }
      );
    }

    // Apply the update
    await prisma.request.update({
      where: { id: data.requestId },
      data: {
        patient_name: data.patient_name,
        dob: new Date(data.dob),
        sex: data.sex,
        address: data.address || null,
        patient_email: data.patient_email || null,
        patient_phone: data.patient_phone || null,
        doctor_prefix: data.doctor_prefix || null,
        doctor_name: data.doctor_name,
        doctor_phone: data.doctor_phone || null,
        doctor_hospital: data.doctor_hospital || null,
        doctor_bank_name: data.doctor_bank_name || null,
        doctor_account_number: data.doctor_account_number || null,
        doctor_account_name: data.doctor_account_name || null,
        schedule: data.schedule || null,
        diagnosis: data.diagnosis || null,
        tests: data.tests,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[requests/edit]", err);
    return NextResponse.json({ success: false, error: "An unexpected error occurred." }, { status: 500 });
  }
}
