export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resend, labSender } from "@/lib/email/resend";
import { doctorTestsCompleted } from "@/lib/email/templates";
import { logApiCall } from "@/lib/api-logger";

const UpdateStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["seen", "done"]),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const parsed = UpdateStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid input" },
        { status: 400 }
      );
    }

    const { requestId, status } = parsed.data;

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
      include: { lab: { select: { name: true, notification_email: true } } },
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

    // Validate status transition: incoming → seen → done
    const validTransitions: Record<string, string[]> = {
      incoming: ["seen"],
      seen: ["done"],
      done: [],
    };

    if (!validTransitions[req.status]?.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Cannot transition from "${req.status}" to "${status}"` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "seen") updateData.seen_at = new Date();
    if (status === "done") updateData.completed_at = new Date();

    await prisma.request.update({ where: { id: requestId }, data: updateData });

    const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;

    // Notify doctor when tests are done
    if (status === "done") {
      resend.emails.send({
        from: labSender(req.lab),
        to: req.doctor_email,
        subject: `Tests Completed — ${req.patient_name}`,
        html: doctorTestsCompleted({
          doctorName: req.doctor_name,
          patientName: req.patient_name,
          labName: req.lab.name,
          code: req.code,
          brand,
        }),
      }).then(({ error }) => { if (error) console.error("[email] tests completed:", JSON.stringify(error)); })
        .catch((e) => console.error("[email] tests completed error:", e));
    }

    logApiCall({ method: "POST", path: "/api/requests/update-status", status: 200, lab_id: req.lab_id, duration_ms: Date.now() - start });
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("Update status error:", error);
    logApiCall({ method: "POST", path: "/api/requests/update-status", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
