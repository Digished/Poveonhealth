import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { labResultsDoctor, labResultsPatient } from "@/lib/email/templates";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const requestId = formData.get("requestId") as string | null;
    const resultLink = (formData.get("resultLink") as string | null)?.trim() || undefined;
    const patientEmailOverride = (formData.get("patientEmail") as string | null)?.trim() || undefined;
    const resultFile = formData.get("resultFile") as File | null;

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "requestId is required" },
        { status: 400 }
      );
    }

    // Authenticate lab user
    const authClient = await createServerClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const labUser = await prisma.labUser.findUnique({
      where: { user_id: user.id },
    });

    if (!labUser) {
      return NextResponse.json(
        { success: false, error: "Lab user not found" },
        { status: 403 }
      );
    }

    // Fetch the request and verify ownership
    const req = await prisma.request.findUnique({
      where: { id: requestId },
      include: { lab: { select: { name: true } } },
    });

    if (!req) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 }
      );
    }

    if (req.lab_id !== labUser.lab_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized to update this request" },
        { status: 403 }
      );
    }

    if (req.status !== "seen") {
      return NextResponse.json(
        { success: false, error: `Cannot send results: request status is "${req.status}"` },
        { status: 400 }
      );
    }

    // Mark as done
    await prisma.request.update({
      where: { id: requestId },
      data: { status: "done", completed_at: new Date() },
    });

    // Prepare file attachment if provided
    let attachments: { filename: string; content: Buffer }[] | undefined;
    if (resultFile && resultFile.size > 0) {
      const arrayBuffer = await resultFile.arrayBuffer();
      attachments = [
        {
          filename: resultFile.name || "lab-results.pdf",
          content: Buffer.from(arrayBuffer),
        },
      ];
    }

    const hasAttachment = !!attachments;
    const patientEmail = patientEmailOverride || req.patient_email || undefined;

    // Send to doctor
    resend.emails.send({
      from: FROM_ADDRESS,
      to: req.doctor_email,
      subject: `Lab Results Available — ${req.patient_name}`,
      html: labResultsDoctor({
        doctorName: req.doctor_name,
        patientName: req.patient_name,
        labName: req.lab.name,
        code: req.code,
        resultLink,
        hasAttachment,
      }),
      ...(attachments ? { attachments } : {}),
    })
      .then(({ error }) => {
        if (error) console.error("[email] results to doctor:", JSON.stringify(error));
      })
      .catch((e) => console.error("[email] results to doctor error:", e));

    // Send to patient if email is available
    if (patientEmail) {
      resend.emails.send({
        from: FROM_ADDRESS,
        to: patientEmail,
        subject: `Your Lab Results Are Ready`,
        html: labResultsPatient({
          patientName: req.patient_name,
          labName: req.lab.name,
          resultLink,
          hasAttachment,
        }),
        ...(attachments ? { attachments } : {}),
      })
        .then(({ error }) => {
          if (error) console.error("[email] results to patient:", JSON.stringify(error));
        })
        .catch((e) => console.error("[email] results to patient error:", e));
    }

    return NextResponse.json({ success: true, status: "done" });
  } catch (error) {
    console.error("Send results error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
