export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDoctorEmailFromConsultRequest, getPatientEmailFromRequest } from "@/lib/consult";
import { CHAT_BUCKET, signCareImage } from "@/lib/care-uploads";
import { ensureCarePlanSchema } from "@/lib/startup/ensure-care-plan-schema";

/**
 * GET /api/consults/chat-image?id=<messageId> — redirect to a photo in a chat.
 *
 * The bucket is private, so the only way in is here: we check the caller is
 * either the member the thread belongs to or the doctor assigned to them, then
 * hand out a link that expires in five minutes.
 */
export async function GET(req: NextRequest) {
  await ensureCarePlanSchema().catch(() => {});
  try {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "No image requested." }, { status: 400 });

    const message = await prisma.consultMessage.findUnique({
      where: { id },
      select: { image_url: true, patient: { select: { email: true, doctor_email: true } } },
    });
    if (!message?.image_url || !message.patient) {
      return NextResponse.json({ error: "Image not found." }, { status: 404 });
    }

    const [patientEmail, doctorEmail] = await Promise.all([
      getPatientEmailFromRequest(req),
      getDoctorEmailFromConsultRequest(req),
    ]);

    const isMember =
      !!patientEmail && patientEmail.toLowerCase() === message.patient.email.toLowerCase();
    const isDoctor =
      !!doctorEmail &&
      !!message.patient.doctor_email &&
      doctorEmail.toLowerCase() === message.patient.doctor_email.toLowerCase();
    if (!isMember && !isDoctor) {
      return NextResponse.json({ error: "Not authorised." }, { status: 403 });
    }

    const url = await signCareImage(CHAT_BUCKET, message.image_url);
    if (!url) return NextResponse.json({ error: "Could not open that photo." }, { status: 500 });

    // A redirect rather than a proxy: the bytes never pass through this function.
    return NextResponse.redirect(url, { status: 307 });
  } catch (err) {
    console.error("[consults/chat-image]", err);
    return NextResponse.json({ error: "Could not open that photo." }, { status: 500 });
  }
}
