export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { resend, labSender } from "@/lib/email/resend";
import { labResultsDoctor, labResultsPatient } from "@/lib/email/templates";
import { logApiCall } from "@/lib/api-logger";

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const formData = await request.formData();

    const requestId = formData.get("requestId") as string | null;
    const resultLink = (formData.get("resultLink") as string | null)?.trim() || undefined;
    const note = (formData.get("note") as string | null)?.trim() || undefined;
    const patientEmailOverride = (formData.get("patientEmail") as string | null)?.trim() || undefined;

    // Support multiple files submitted under the key "resultFiles"
    const rawFiles = formData.getAll("resultFiles");
    const resultFiles = rawFiles.filter(
      (f): f is File => f instanceof File && f.size > 0
    );

    if (!requestId) {
      return NextResponse.json(
        { success: false, error: "requestId is required" },
        { status: 400 }
      );
    }

    if (resultFiles.length === 0 && !resultLink) {
      return NextResponse.json(
        { success: false, error: "At least one PDF attachment or a result link is required" },
        { status: 400 }
      );
    }

    const MAX_FILES = 5;
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file

    if (resultFiles.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, error: "Maximum 5 files allowed per submission" },
        { status: 400 }
      );
    }

    const oversized = resultFiles.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      return NextResponse.json(
        { success: false, error: "Each file must be under 10MB" },
        { status: 400 }
      );
    }

    // Authenticate lab user/member/API key
    const auth = await getLabAuth(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }
    if (!auth.permissions.can_send_results) {
      return NextResponse.json(
        { success: false, error: "You do not have permission to send results" },
        { status: 403 }
      );
    }

    // Fetch the request and verify ownership
    const req = await prisma.request.findUnique({
      where: { id: requestId },
      include: { lab: { select: { name: true, notification_email: true, request_email: true, whatsapp: true } } },
    });

    if (!req) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 }
      );
    }

    if (req.lab_id !== auth.lab_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized to update this request" },
        { status: 403 }
      );
    }

    // Only "seen" and "done" requests can have results sent
    if (req.status === "incoming") {
      return NextResponse.json(
        { success: false, error: "Patient must be seen before results can be sent" },
        { status: 400 }
      );
    }

    // Mark as done only if still in "seen" state
    if (req.status === "seen") {
      await prisma.request.update({
        where: { id: requestId },
        data: { status: "done", completed_at: new Date() },
      });
    }

    // Build email attachments from uploaded PDFs
    const attachments: { filename: string; content: Buffer }[] = await Promise.all(
      resultFiles.map(async (f) => ({
        filename: f.name || "lab-results.pdf",
        content: Buffer.from(await f.arrayBuffer()),
      }))
    );

    const hasAttachment = attachments.length > 0;
    const patientEmail = patientEmailOverride || req.patient_email || undefined;
    const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;

    // Send to doctor
    resend.emails.send({
      from: labSender(req.lab),
      to: req.doctor_email,
      subject: `Lab Results Available — ${req.patient_name}`,
      html: labResultsDoctor({
        doctorName: req.doctor_name,
        patientName: req.patient_name,
        labName: req.lab.name,
        code: req.code,
        resultLink,
        hasAttachment,
        note,
        brand,
      }),
      ...(attachments.length > 0 ? { attachments } : {}),
    })
      .then(({ error }) => {
        if (error) console.error("[email] results to doctor:", JSON.stringify(error));
      })
      .catch((e) => console.error("[email] results to doctor error:", e));

    // Send to patient if email is available
    if (patientEmail) {
      resend.emails.send({
        from: labSender(req.lab),
        to: patientEmail,
        subject: "Your Lab Results Are Ready",
        html: labResultsPatient({
          patientName: req.patient_name,
          labName: req.lab.name,
          resultLink,
          hasAttachment,
          brand,
        }),
        ...(attachments.length > 0 ? { attachments } : {}),
      })
        .then(({ error }) => {
          if (error) console.error("[email] results to patient:", JSON.stringify(error));
        })
        .catch((e) => console.error("[email] results to patient error:", e));
    }

    logApiCall({ method: "POST", path: "/api/requests/send-results", status: 200, lab_id: req.lab_id, duration_ms: Date.now() - start });
    return NextResponse.json({ success: true, status: req.status === "seen" ? "done" : req.status });
  } catch (error) {
    console.error("Send results error:", error);
    logApiCall({ method: "POST", path: "/api/requests/send-results", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
