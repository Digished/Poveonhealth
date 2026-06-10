export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueCode } from "@/lib/code-generator";
import { notifyReferralCreated } from "@/lib/referral-notify";

const CreateReferralSchema = z.object({
  // Doctor identity — email + PIN verified at send time (no login required)
  doctor_email: z.string().email(),
  doctor_pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),

  // Patient details
  patient_name: z.string().trim().min(2).max(160),
  patient_age: z.coerce.number().int().min(0).max(130).optional().nullable(),
  patient_sex: z.enum(["male", "female", "other"]).optional().nullable(),
  patient_phone: z.string().trim().min(7).max(20),
  patient_email: z.string().email().optional().nullable().or(z.literal("")),
  hospital_number: z.string().trim().max(60).optional().nullable(),

  // Referral details
  from_hospital_id: z.string().uuid("Choose the hospital you are referring from."),
  to_hospital_id: z.string().uuid(),
  specialty: z.string().trim().min(2).max(120),
  urgency: z.enum(["routine", "urgent", "emergency"]).default("routine"),
  clinical_note: z.string().trim().min(20, "The referral note is too short.").max(20000),
  provisional_diagnosis: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = CreateReferralSchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid referral data." },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const doctorEmail = data.doctor_email.trim().toLowerCase();

    // 1. Verify the doctor's PIN
    const profile = await prisma.doctorProfile.findUnique({
      where: { email: doctorEmail },
      select: { pin_hash: true, prefix: true, full_name: true, phone: true },
    });
    const pinHash = createHash("sha256").update(data.doctor_pin).digest("hex");
    if (!profile?.pin_hash || profile.pin_hash !== pinHash) {
      return NextResponse.json(
        { error: "Incorrect email or PIN. If you haven't set a PIN yet, log in to the doctor portal first." },
        { status: 401 }
      );
    }

    // 2. The doctor must be registered under the hospital they are referring FROM.
    //    The receiving hospital only needs to be on the Poveon network.
    const membership = await prisma.hospitalDoctor.findFirst({
      where: { doctor_email: doctorEmail, hospital_id: data.from_hospital_id, hospital: { is_active: true } },
      include: { hospital: { select: { name: true } } },
    });
    if (!membership) {
      return NextResponse.json(
        {
          error:
            "You are not registered under the selected hospital. Choose a hospital that has added you to their network, or ask your hospital to add you from their dashboard.",
        },
        { status: 403 }
      );
    }
    const fromHospitalName = membership.hospital.name;

    // 3. Validate the destination hospital
    if (data.to_hospital_id === data.from_hospital_id) {
      return NextResponse.json({ error: "The receiving hospital must be different from the referring hospital." }, { status: 400 });
    }
    const toHospital = await prisma.hospital.findUnique({ where: { id: data.to_hospital_id } });
    if (!toHospital || !toHospital.is_active) {
      return NextResponse.json({ error: "The selected hospital is not available." }, { status: 404 });
    }

    const doctorName = profile.full_name
      ? `${profile.prefix ? `${profile.prefix} ` : "Dr. "}${profile.full_name}`
      : doctorEmail;

    // 4. Create the referral with a unique code
    const code = await generateUniqueCode("REF", async (candidate) => {
      const existing = await prisma.referral.findUnique({ where: { code: candidate }, select: { id: true } });
      return !!existing;
    });

    const referral = await prisma.referral.create({
      data: {
        code,
        patient_name: data.patient_name,
        patient_age: data.patient_age ?? null,
        patient_sex: data.patient_sex ?? null,
        patient_phone: data.patient_phone,
        patient_email: data.patient_email ? data.patient_email.trim().toLowerCase() : null,
        hospital_number: data.hospital_number || null,
        doctor_email: doctorEmail,
        doctor_name: doctorName,
        doctor_phone: profile.phone ?? null,
        from_hospital: fromHospitalName,
        to_hospital_id: toHospital.id,
        specialty: data.specialty,
        urgency: data.urgency,
        clinical_note: data.clinical_note,
        provisional_diagnosis: data.provisional_diagnosis || null,
        events: {
          create: {
            type: "created",
            actor_type: "doctor",
            actor_label: doctorName,
            to_hospital_id: toHospital.id,
          },
        },
      },
    });

    // 5. Notify hospital (email), doctor (email) and patient (email + SMS) — fire-and-forget
    notifyReferralCreated(referral, { name: toHospital.name, email: toHospital.email });

    return NextResponse.json({
      success: true,
      code,
      referralId: referral.id,
      hospital: { name: toHospital.name, address: toHospital.address, phone: toHospital.phone },
    });
  } catch (err) {
    console.error("[referrals/create]", err);
    return NextResponse.json({ error: "Failed to create referral. Please try again." }, { status: 500 });
  }
}
