export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getDoctorFromRequest, doctorCoversMember } from "@/lib/hmo/auth";

const BodySchema = z.object({
  flagged: z.boolean(),
  note: z.string().max(500).optional(),
});

// Flag / unflag a monitored member as "of concern".
export async function POST(
  req: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const doctor = await getDoctorFromRequest(req);
    if (!doctor) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const member = await prisma.hmoMember.findUnique({ where: { id: params.memberId } });
    if (!member) {
      return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }
    if (!(await doctorCoversMember(doctor.doctor_email, member))) {
      return NextResponse.json({ error: "You are not assigned to this patient." }, { status: 403 });
    }

    const updated = await prisma.hmoMember.update({
      where: { id: member.id },
      data: parsed.data.flagged
        ? {
            flagged: true,
            flagged_by: doctor.doctor_email,
            flagged_at: new Date(),
            flag_note: parsed.data.note?.trim() || null,
          }
        : { flagged: false, flagged_by: null, flagged_at: null, flag_note: null },
      select: { id: true, flagged: true, flag_note: true },
    });

    return NextResponse.json({ success: true, member: updated });
  } catch (err) {
    console.error("[doc-login/monitoring/flag]", err);
    return NextResponse.json({ error: "Failed to update flag." }, { status: 500 });
  }
}
