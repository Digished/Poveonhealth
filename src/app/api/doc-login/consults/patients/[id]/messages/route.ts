export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { carePlanReplyEmail } from "@/lib/email/templates";
import { appUrl, getDoctorEmailFromConsultRequest } from "@/lib/consult";
import { CHAT_BUCKET, readChatPayload, uploadCareImage } from "@/lib/care-uploads";
import { preview, pushTo } from "@/lib/push";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

const BodySchema = z.object({ body: z.string().trim().max(6000) });

/**
 * GET — one member's thread, for the chat button. Opening a conversation
 * should not load the member's whole record.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({
      where: { id: params.id },
      select: {
        id: true, code: true, full_name: true, doctor_email: true, conditions: true,
        status: true, share_history: true, previous_doctors: true, assigned_at: true,
      },
    });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    // A member who asked us not to share their history takes it with them.
    const historyFrom =
      patient.share_history === false && patient.previous_doctors.length > 0
        ? patient.assigned_at
        : null;

    const messages = await prisma.consultMessage.findMany({
      where: {
        patient_id: patient.id,
        ...(historyFrom ? { created_at: { gte: historyFrom } } : {}),
      },
      orderBy: { created_at: "asc" },
      take: 200,
    });

    void prisma.consultMessage
      .updateMany({
        where: { patient_id: patient.id, sender: "patient", read_at: null },
        data: { read_at: new Date() },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        code: patient.code,
        full_name: patient.full_name,
        conditions: patient.conditions,
      },
      history_withheld: !!historyFrom,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        has_image: !!m.image_url,
        created_at: m.created_at,
      })),
    });
  } catch (err) {
    console.error("[doc-login/consults/patients/[id]/messages GET]", err);
    return NextResponse.json({ error: "Could not load that conversation." }, { status: 500 });
  }
}

/**
 * POST /api/doc-login/consults/patients/[id]/messages — the doctor writes to a
 * member. Doctor messages are never counted against the member's allowance.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // The build-time migration is best-effort; make sure the tables are there.
  await ensureCarePlanSchema().catch(() => {});
  try {
    const email = await getDoctorEmailFromConsultRequest(req);
    if (!email) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const patient = await prisma.consultPatient.findUnique({ where: { id: params.id } });
    if (!patient || patient.doctor_email !== email) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const payload = await readChatPayload(req);
    const parsed = BodySchema.safeParse({ body: payload.body });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid reply." }, { status: 400 });
    }
    if (!parsed.data.body && !payload.file) {
      return NextResponse.json({ error: "Write your reply first." }, { status: 400 });
    }

    let imagePath: string | null = null;
    if (payload.file) {
      const upload = await uploadCareImage(CHAT_BUCKET, patient.id, payload.file);
      if ("error" in upload) {
        return NextResponse.json({ error: upload.error }, { status: upload.status });
      }
      imagePath = upload.path;
    }

    const message = await prisma.consultMessage.create({
      data: {
        patient_id: patient.id,
        sender: "doctor",
        body: parsed.data.body,
        image_url: imagePath,
      },
    });

    // Replying clears the member's unread flag on the doctor's side — the
    // thread has been dealt with, so it drops out of the chat button's list.
    void prisma.consultMessage
      .updateMany({
        where: { patient_id: patient.id, sender: "patient", read_at: null },
        data: { read_at: new Date() },
      })
      .catch(() => {});

    void pushTo("patient", patient.email, {
      title: "Your doctor replied",
      body: preview(parsed.data.body || "Sent a photo"),
      url: "/dashboard?tab=care-messages",
      tag: "doctor-reply",
    }).catch(() => {});

    void notifyMember(patient.email, patient.full_name, email, parsed.data.body || "(sent a photo)").catch((e) =>
      console.error("[doc-login/consults] member email:", e)
    );

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        sender: "doctor",
        body: message.body,
        has_image: !!message.image_url,
        created_at: message.created_at,
      },
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
