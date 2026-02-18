import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { doctorTestsCompleted } from "@/lib/email/templates";

const UpdateStatusSchema = z.object({
  requestId: z.string().uuid(),
  status: z.enum(["seen", "done"]),
});

export async function POST(request: NextRequest) {
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

    // Authenticate user
    const authClient = await createServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const adminClient = createAdminClient();

    // Get the lab_id for this user
    const { data: labUser } = await adminClient
      .from("lab_users")
      .select("lab_id")
      .eq("user_id", user.id)
      .single();

    if (!labUser) {
      return NextResponse.json(
        { success: false, error: "Lab user not found" },
        { status: 403 }
      );
    }

    // Fetch the request to verify ownership
    const { data: req, error: fetchError } = await adminClient
      .from("requests")
      .select("*, labs(name)")
      .eq("id", requestId)
      .single();

    if (fetchError || !req) {
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

    // Validate status transition
    const validTransitions: Record<string, string[]> = {
      incoming: ["seen"],
      seen: ["done"],
      done: [],
    };

    if (!validTransitions[req.status]?.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot transition from "${req.status}" to "${status}"`,
        },
        { status: 400 }
      );
    }

    // Build update payload
    const updatePayload: Record<string, string> = { status };
    if (status === "seen") updatePayload.seen_at = new Date().toISOString();
    if (status === "done") updatePayload.completed_at = new Date().toISOString();

    await adminClient
      .from("requests")
      .update(updatePayload)
      .eq("id", requestId);

    // When marked done, notify the referring doctor
    if (status === "done") {
      const labName =
        (req.labs as { name: string } | null)?.name ?? "the laboratory";

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: req.doctor_email,
        subject: `Tests Completed — ${req.patient_name}`,
        html: doctorTestsCompleted({
          doctorName: req.doctor_name,
          patientName: req.patient_name,
          labName,
          code: req.code,
        }),
      });
    }

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("Update status error:", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
