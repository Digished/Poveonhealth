export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { carePlanReplyEmail } from "@/lib/email/templates";
import { appUrl, getDoctorEmailFromConsultRequest } from "@/lib/consult";

const BodySchema = z.object({ body: z.string().trim().min(2, "Write your reply first").max(6000) });

/**
 * POST /api/doc-login/consults/patients/[id]/messages — the doctor writes to a
 * member. Doctor messages are never counted against the member's allowance.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({ where: { id: params.id } });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid reply." }, { status: 400 });
    }

    const message = await prisma.consultMessage.create({
      data: { patient_id: patient.id, sender: "doctor", body: parsed.data.body },
    });

    void notifyMember(patient.email, patient.full_name, email, parsed.data.body).catch((e) =>
      console.error("[doc-login/consults] member email:", e)
    );

    return NextResponse.json({
      success: true,
      message: { id: message.id, sender: "doctor", body: message.body, created_at: message.created_at },
    });
  } catch (err) {
    console.error("[doc-login/consults/patients/[id]/messages]", err);
    return NextResponse.json({ error: "Could not send your reply." }, { status: 500 });
  }
}

async function notifyMember(to: string, memberName: string, doctorEmail: string, body: string) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { email: doctorEmail },
    select: { full_name: true, prefix: true },
  });
  await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Your Poveon doctor replied",
    html: carePlanReplyEmail({
      memberName,
      doctorName: doctor?.full_name ? `${doctor.prefix ? `${doctor.prefix} ` : ""}${doctor.full_name}` : "Your doctor",
      preview: body.slice(0, 800),
      dashboardUrl: `${appUrl()}/dashboard?tab=care`,
    }),
  });
}
