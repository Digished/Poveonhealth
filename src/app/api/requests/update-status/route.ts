export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getLabAuth } from "@/lib/lab-auth";
import { resend, labSender } from "@/lib/email/resend";
import { doctorTestsCompleted } from "@/lib/email/templates";
import { logApiCall } from "@/lib/api-logger";
import { logLabActivity } from "@/lib/lab-activity";
import { createServerClient } from "@/lib/supabase/server";
import { reportAllTracks, markSeenWithCommission } from "@/lib/lims";

const UpdateStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["seen", "done"]),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  try {
    const body = await request.json();
    const parsed = UpdateStatusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });

    const { requestId, status } = parsed.data;

    const auth = await getLabAuth(request);
    if (!auth) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

    const requiredPerm = status === "seen" ? "can_mark_seen" : "can_mark_done";
    if (!auth.permissions[requiredPerm]) {
      return NextResponse.json({ success: false, error: "You do not have permission to perform this action" }, { status: 403 });
    }

    const req = await prisma.request.findUnique({
      where: { id: requestId },
      include: { lab: { select: { name: true, notification_email: true, free_trial: true } } },
    });
    if (!req) return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    if (req.lab_id !== auth.lab_id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const validTransitions: Record<string, string[]> = { incoming: ["seen"], seen: ["done"], done: [] };
    if (!validTransitions[req.status]?.includes(status)) {
      return NextResponse.json({ success: false, error: `Cannot transition from "${req.status}" to "${status}"` }, { status: 400 });
    }

    if (status === "seen") {
      // Single source of truth: same routine the journey uses to auto-promote.
      await markSeenWithCommission(requestId);
    } else {
      await prisma.request.update({ where: { id: requestId }, data: { status: "done", completed_at: new Date() } });
      // LIMS: results delivered — close out every department track.
      await reportAllTracks(requestId, req.lab_id, req.test_breakdown, auth.actor_email).catch(() => {});
    }

    // Activity log (non-critical)
    try {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && auth.auth_method !== "api_key") {
        logLabActivity({
          lab_id:      req.lab_id,
          actor_email: user.email ?? "unknown",
          actor_role:  user.user_metadata?.role === "lab" ? "owner" : "member",
          action:      status === "seen" ? "request_seen" : "request_done",
          detail:      `Request ${req.code} marked as ${status === "seen" ? "Seen" : "Done"}`,
        });
      }
    } catch { /* non-critical */ }

    // Email doctor when done
    if (status === "done" && req.doctor_email) {
      const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;
      resend.emails.send({
        from:    labSender(req.lab),
        to:      req.doctor_email,
        subject: `Tests Completed — ${req.patient_name ?? "Patient"}`,
        html:    doctorTestsCompleted({ doctorName: req.doctor_name, patientName: req.patient_name ?? "Patient", labName: req.lab.name, code: req.code, brand }),
      }).catch(() => {});
    }

    logApiCall({ method: "POST", path: "/api/requests/update-status", status: 200, lab_id: req.lab_id, duration_ms: Date.now() - start });
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("[update-status]", error);
    logApiCall({ method: "POST", path: "/api/requests/update-status", status: 500, duration_ms: Date.now() - start });
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 });
  }
}
