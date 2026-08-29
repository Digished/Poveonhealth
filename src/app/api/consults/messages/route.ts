export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { carePlanDoctorMessageEmail } from "@/lib/email/templates";
import { appUrl, getMemberFromRequest } from "@/lib/consult";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({ body: z.string().trim().min(2, "Write your message first").max(4000) });

/**
 * POST /api/consults/messages — the member writes to their doctor.
 *
 * Each message spends one of the year's allowance; the doctor may reply as
 * often as the case needs without spending anything.
 */
export async function POST(req: NextRequest) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const member = await getMemberFromRequest(req);
    if (!member) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (member.status !== "active") {
      return NextResponse.json(
        { error: "Your care plan isn't active. Renew it to keep messaging your doctor." },
        { status: 403 }
      );
    }
    if (!member.doctor_email) {
      return NextResponse.json(
        { error: "We're still matching you with a doctor. Please try again shortly." },
        { status: 409 }
      );
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid message." }, { status: 400 });
    }

    if (member.messages_used >= member.message_allowance) {
      return NextResponse.json(
        { error: "You've used all the messages included this year." },
        { status: 403 }
      );
    }

    const [message] = await prisma.$transaction([
      prisma.consultMessage.create({
        data: { patient_id: member.id, sender: "patient", body: parsed.data.body, counted: true },
      }),
      prisma.consultPatient.update({
        where: { id: member.id },
        data: { messages_used: { increment: 1 } },
      }),
    ]);

    const messagesLeft = Math.max(0, member.message_allowance - member.messages_used - 1);
    void notifyDoctor(member.doctor_email, member.full_name, parsed.data.body, messagesLeft).catch((e) =>
      console.error("[consults/messages] doctor email:", e)
    );

    return NextResponse.json({
      success: true,
      message: { id: message.id, sender: "patient", body: message.body, created_at: message.created_at },
      messages_left: messagesLeft,
    });
  } catch (err) {
    console.error("[consults/messages]", err);
    return NextResponse.json({ error: "Could not send your message." }, { status: 500 });
  }
}

async function notifyDoctor(doctorEmail: string, memberName: string, body: string, messagesLeft: number) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { email: doctorEmail },
    select: { full_name: true, prefix: true },
  });
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: doctorEmail,
    subject: `${memberName} sent you a care-plan message`,
    html: carePlanDoctorMessageEmail({
      doctorName: doctor?.full_name ? `${doctor.prefix ? `${doctor.prefix} ` : ""}${doctor.full_name}` : "Doctor",
      memberName,
      preview: body.slice(0, 600),
      messagesLeft,
      dashboardUrl: `${appUrl()}/doc-login/dashboard?tab=consults`,
    }),
  });
}
