export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { CONDITIONS } from "@/lib/consult-conditions";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  conditions: z.array(z.enum(CONDITIONS)).min(1, "A member needs at least one condition").max(10),
});

/**
 * PATCH — change what the plan covers.
 *
 * A member who enrolled with hypertension and later develops diabetes stays
 * one member: the doctor adds the condition rather than the member re-enrolling.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({
      where: { id: params.id },
      select: { id: true, doctor_email: true, conditions: true },
    });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change." }, { status: 400 });
    }

    // Order them so the display is stable however the doctor ticked them.
    const conditions = CONDITIONS.filter((c) => parsed.data.conditions.includes(c));

    await prisma.consultPatient.update({
      where: { id: patient.id },
      data: { conditions },
    });

    return NextResponse.json({ success: true, conditions });
  } catch (err) {
    console.error("[doc-login/consults/conditions]", err);
    return NextResponse.json({ error: "Could not update the conditions." }, { status: 500 });
  }
}
