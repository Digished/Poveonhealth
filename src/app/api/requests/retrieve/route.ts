import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
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

    // Authenticate the calling user (must be a logged-in lab user)
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

    // Get the lab_id for this authenticated user
    const { data: labUser } = await adminClient
      .from("lab_users")
      .select("lab_id")
      .eq("user_id", user.id)
      .single();

    if (!labUser) {
      return NextResponse.json(
        { success: false, error: "Lab user record not found" },
        { status: 403 }
      );
    }

    // Look up the request by code (without lab filter first)
    const { data: req, error: reqError } = await adminClient
      .from("requests")
      .select("*, labs(name, addresses)")
      .eq("code", code)
      .maybeSingle();

    if (reqError) {
      console.error("Request lookup error:", reqError);
      return NextResponse.json(
        { success: false, error: "Database error" },
        { status: 500 }
      );
    }

    if (!req) {
      return NextResponse.json(
        { success: false, error: "No request found with that code" },
        { status: 404 }
      );
    }

    // Check if this code belongs to the lab that's querying it
    if (req.lab_id !== labUser.lab_id) {
      return NextResponse.json(
        {
          success: false,
          error: "This request does not belong to your laboratory.",
        },
        { status: 403 }
      );
    }

    // If the request is still incoming, move it to "seen"
    if (req.status === "incoming") {
      await adminClient
        .from("requests")
        .update({ status: "seen", seen_at: new Date().toISOString() })
        .eq("id", req.id);

      // Notify referring doctor that patient has arrived
      const labName =
        (req.labs as { name: string } | null)?.name ?? "the laboratory";

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: req.doctor_email,
        subject: `Patient Arrived — ${req.patient_name} is at ${labName}`,
        html: doctorPatientArrived({
          doctorName: req.doctor_name,
          patientName: req.patient_name,
          labName,
          code: req.code,
        }),
      });

      return NextResponse.json({
        success: true,
        request: { ...req, status: "seen" },
      });
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
