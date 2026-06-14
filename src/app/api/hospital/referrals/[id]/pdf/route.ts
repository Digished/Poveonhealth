export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { prisma } from "@/lib/prisma";
import { getHospitalFromRequest } from "@/lib/hospital-auth";
import { ReferralPdf } from "@/lib/referral-pdf";

/** GET /api/hospital/referrals/[id]/pdf — the referral letter as a PDF document */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const hospital = await getHospitalFromRequest(req);
    if (!hospital) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { id } = await params;
    const referral = await prisma.referral.findUnique({
      where: { id },
      include: { to_hospital: { select: { name: true, address: true, city: true, state: true } } },
    });
    if (!referral || referral.to_hospital_id !== hospital.id) {
      return NextResponse.json({ error: "Referral not found." }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { renderToBuffer } = (await import("@react-pdf/renderer")) as any;
    const pdfBuffer = await renderToBuffer(
      React.createElement(ReferralPdf, {
        code: referral.code,
        status: referral.status,
        created_at: referral.created_at,
        urgency: referral.urgency,
        specialty: referral.specialty,
        from_hospital: referral.from_hospital,
        to_hospital_name: referral.to_hospital.name,
        to_hospital_address: referral.to_hospital.address,
        to_hospital_city: referral.to_hospital.city,
        to_hospital_state: referral.to_hospital.state,
        patient_name: referral.patient_name,
        patient_age: referral.patient_age,
        patient_sex: referral.patient_sex,
        patient_phone: referral.patient_phone,
        patient_email: referral.patient_email,
        hospital_number: referral.hospital_number,
        doctor_name: referral.doctor_name,
        doctor_email: referral.doctor_email,
        doctor_phone: referral.doctor_phone,
        provisional_diagnosis: referral.provisional_diagnosis,
        clinical_note: referral.clinical_note,
      })
    );

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Referral-${referral.code}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[hospital/referrals/:id/pdf]", err);
    return NextResponse.json({ error: "Failed to generate PDF." }, { status: 500 });
  }
}
