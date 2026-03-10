export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, labSender } from "@/lib/email/resend";
import { doctorPatientArrived } from "@/lib/email/templates";

const RetrieveSchema = z.object({
  code: z.string().min(1).max(50).transform((s) => s.trim().toUpperCase()),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RetrieveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid code format" },
        { status: 400 }
      );
    }

    const { code } = parsed.data;

    // Authenticate the lab user
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Get this user's lab_id
    const labUser = await prisma.labUser.findUnique({
      where: { user_id: user.id },
    });

    if (!labUser) {
      return NextResponse.json(
        { success: false, error: "Lab user record not found" },
        { status: 403 }
      );
    }

    // Look up the request by code
    const req = await prisma.request.findUnique({
      where: { code },
      include: { lab: { select: { name: true, address: true, notification_email: true } } },
    });

    if (!req) {
      return NextResponse.json(
        { success: false, error: "No request found with that code" },
        { status: 404 }
      );
    }

    // Verify code belongs to this lab
    if (req.lab_id !== labUser.lab_id) {
      return NextResponse.json(
        { success: false, error: "This request does not belong to your laboratory." },
        { status: 403 }
      );
    }

    // Move incoming → seen and notify doctor
    if (req.status === "incoming") {
      await prisma.request.update({
        where: { id: req.id },
        data: { status: "seen", seen_at: new Date() },
      });

      resend.emails.send({
        from: labSender(req.lab),
        to: req.doctor_email,
        subject: `Patient Arrived — ${req.patient_name} is at ${req.lab.name}`,
        html: doctorPatientArrived({
          doctorName: req.doctor_name,
          patientName: req.patient_name,
          labName: req.lab.name,
          code: req.code,
        }),
      }).then(({ error }) => { if (error) console.error("[email] patient arrived:", JSON.stringify(error)); })
        .catch((e) => console.error("[email] patient arrived error:", e));

      return NextResponse.json({ success: true, request: { ...req, status: "seen" } });
    }

    return NextResponse.json({ success: true, request: req });
  } catch (error) {
    console.error("Retrieve error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
