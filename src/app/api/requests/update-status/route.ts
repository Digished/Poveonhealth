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

    if (status === "seen") {
      // Re-resolve tests against the current lab catalog so commission is always
      // calculated from up-to-date catalog data.
      // Uses raw SQL for the entire seen update — this is the proven approach
      // (identical SQL logic works via Supabase console).
      const testsString = req.tests && req.tests !== "See attached image" ? req.tests : null;

      if (testsString) {
        // Resolve tests, then write breakdown + status + commission in two steps.
        // Step 1: write the resolved breakdown via Prisma (Json field — works reliably).
        let breakdown: object[] = [];
        try {
          breakdown = await resolveTests(testsString, req.lab_id);
        } catch (e) {
          console.error("[update-status] resolveTests failed:", e);
        }

        if (breakdown.length > 0) {
          await prisma.request.update({
            where: { id: requestId },
            data: { test_breakdown: breakdown },
          });
        }
      }

      // Step 2: atomic SQL — mark seen + compute commission from whatever is in
      // test_breakdown. This mirrors the exact SQL that worked in Supabase console.
      await prisma.$executeRawUnsafe(
        `UPDATE requests
         SET status = 'seen',
             seen_at = NOW(),
             poveon_amount = (
               SELECT COALESCE(SUM((item->>'poveon_fee')::numeric), 0)
               FROM jsonb_array_elements(COALESCE(test_breakdown, '[]'::jsonb)) AS item
               WHERE item->>'source' = 'lab_catalog'
             ),
             lab_revenue_amount = (
               SELECT COALESCE(SUM((item->>'unit_price')::numeric), 0)
               FROM jsonb_array_elements(COALESCE(test_breakdown, '[]'::jsonb)) AS item
               WHERE item->>'source' = 'lab_catalog'
             )
         WHERE id = $1`,
        requestId
      );
    } else {
      // status === "done"
      await prisma.request.update({
        where: { id: requestId },
        data: { status: "done", completed_at: new Date() },
      });
    }

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
