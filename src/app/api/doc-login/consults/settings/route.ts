export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getConsultSettings, getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  accepting: z.boolean().optional(),
  // How many care-plan members this doctor is willing to carry in a year.
  patient_cap: z.coerce.number().int().min(0).max(5000).nullable().optional(),
});

/** PATCH /api/doc-login/consults/settings — the doctor's intake preferences. */
export async function PATCH(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid preferences." }, { status: 400 });
    }

    const data: { consult_accepting?: boolean; consult_patient_cap?: number | null } = {};
    if (parsed.data.accepting !== undefined) data.consult_accepting = parsed.data.accepting;
    if (parsed.data.patient_cap !== undefined) data.consult_patient_cap = parsed.data.patient_cap;

    const profile = await prisma.doctorProfile.update({
      where: { email },
      data,
      select: { consult_accepting: true, consult_patient_cap: true },
    });
    const settings = await getConsultSettings();

    return NextResponse.json({
      success: true,
      preferences: {
        accepting: profile.consult_accepting,
        patient_cap: profile.consult_patient_cap,
        default_cap: settings.default_doctor_cap,
        effective_cap: profile.consult_patient_cap ?? settings.default_doctor_cap,
      },
    });
  } catch (err) {
    console.error("[doc-login/consults/settings]", err);
    return NextResponse.json({ error: "Could not save your preferences." }, { status: 500 });
  }
}
