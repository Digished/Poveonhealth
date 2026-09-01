export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({
  /** null hands the member back to the automatic rating. */
  level: z.enum(["none", "watch", "high", "critical"]).nullable(),
  note: z.string().trim().max(300).optional().nullable(),
});

/**
 * PATCH — the doctor's own judgement of how this member is doing.
 *
 * It overrides the automatic rating in both directions, because a threshold
 * sees one number and a doctor sees the person: someone whose readings look
 * alarming may be well understood and stable, and someone whose numbers are
 * fine may still worry their doctor. Clearing it hands them back to the
 * thresholds.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({
      where: { id: params.id },
      select: { id: true, doctor_email: true },
    });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change." }, { status: 400 });
    }

    const updated = await prisma.consultPatient.update({
      where: { id: patient.id },
      data: {
        risk_manual: parsed.data.level,
        risk_note: parsed.data.level ? parsed.data.note || null : null,
        risk_set_by: parsed.data.level ? email : null,
      },
      select: { risk_level: true, risk_reason: true, risk_manual: true, risk_note: true },
    });

    return NextResponse.json({ success: true, risk: updated });
  } catch (err) {
    console.error("[doc-login/consults/risk]", err);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
