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
import { resolveTests } from "@/lib/resolve-tests";

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

    // Authenticate lab user/member/API key
    const auth = await getLabAuth(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Check permission based on which status is being set
    const requiredPerm = status === "seen" ? "can_mark_seen" : "can_mark_done";
    if (!auth.permissions[requiredPerm]) {
      return NextResponse.json(
        { success: false, error: "You do not have permission to perform this action" },
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

    if (req.lab_id !== auth.lab_id) {
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

    // When marking "seen" — re-resolve tests against the current lab catalog to
    // get accurate commission. We re-resolve rather than using the stored breakdown
    // so that (a) catalog additions after request creation are picked up, and
    // (b) matching improvements apply to historical requests retroactively.
    if (status === "seen") {
      try {
        const testsString = req.tests && req.tests !== "See attached image" ? req.tests : null;
        let breakdown: Array<{ source?: string; poveon_fee?: number | null; unit_price?: number }> = [];

        if (testsString) {
          breakdown = await resolveTests(testsString, req.lab_id);
        } else if (req.test_breakdown && Array.isArray(req.test_breakdown)) {
          breakdown = req.test_breakdown as Array<{ source?: string; poveon_fee?: number | null; unit_price?: number }>;
        }

        let poveonTotal = 0;
        let labRevenueTotal = 0;
        for (const item of breakdown) {
          if (item.source === "lab_catalog") {
            poveonTotal += item.poveon_fee ?? 0;
            labRevenueTotal += item.unit_price ?? 0;
          }
        }

        // Explicit typed update so Prisma's generated client correctly maps these fields
        await prisma.request.update({
          where: { id: requestId },
          data: {
            poveon_amount: poveonTotal,
            lab_revenue_amount: labRevenueTotal,
            ...(testsString ? { test_breakdown: breakdown } : {}),
          },
        });
      } catch (e) {
        console.error("[commission] recalculation failed:", e);
      }
    }

    await prisma.request.update({ where: { id: requestId }, data: updateData });

    // Log activity
    try {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && auth.auth_method !== "api_key") {
        const actorRole = user.user_metadata?.role === "lab" ? "owner" : "member";
        logLabActivity({
          lab_id: req.lab_id,
          actor_email: user.email ?? "unknown",
          actor_role: actorRole,
          action: status === "seen" ? "request_seen" : "request_done",
          detail: `Request ${req.code} for ${req.patient_name ?? "patient"} marked as ${status === "seen" ? "Patient Seen" : "Done"}`,
        });
      }
    } catch { /* non-critical */ }

    const brand = req.lab.notification_email ? { name: req.lab.name } : undefined;

    // Notify doctor when tests are done
    if (status === "done") {
      resend.emails.send({
        from: labSender(req.lab),
        to: req.doctor_email,
        subject: `Tests Completed — ${req.patient_name ?? "Patient"}`,
        html: doctorTestsCompleted({
          doctorName: req.doctor_name,
          patientName: req.patient_name ?? "Patient",
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
