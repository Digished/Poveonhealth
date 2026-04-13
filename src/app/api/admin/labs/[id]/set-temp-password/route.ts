export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/email/resend";
import { labSender } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: z.string().email(),
  temp_password: z.string().min(8).optional(), // If not provided, will generate one
});

/**
 * POST /api/admin/labs/[id]/set-temp-password
 * Create and set a temporary password for a lab account (admin only)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const labId = (await params).id;
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request: email and password required" },
        { status: 400 }
      );
    }

    const { email: rawEmail, temp_password: providedPassword } = parsed.data;
    const email = rawEmail.trim().toLowerCase();

    // Verify lab exists
    const lab = await prisma.lab.findUnique({ where: { id: labId } });
    if (!lab) {
      return NextResponse.json({ error: "Lab not found" }, { status: 404 });
    }

    // Check email belongs to lab
    if (lab.email !== email) {
      return NextResponse.json(
        { error: "Email does not match lab email" },
        { status: 400 }
      );
    }

    // Generate temporary password if not provided
    const tempPassword = providedPassword || randomBytes(6).toString("hex").toUpperCase();

    // Update password in Supabase
    const adminSupabase = createAdminClient();
    const { data: users } = await adminSupabase.auth.admin.listUsers();
    const user = users?.users?.find(
      (u) =>
        u.email?.toLowerCase() === email &&
        (u.user_metadata?.role === "lab" || u.user_metadata?.role === "lab_member")
    );

    if (!user) {
      return NextResponse.json(
        { error: "Lab account not found in authentication system" },
        { status: 404 }
      );
    }

    const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(user.id, {
      password: tempPassword,
    });

    if (updateErr) {
      console.error("[set-temp-password] Supabase update error:", updateErr);
      return NextResponse.json(
        { error: "Failed to set password: " + updateErr.message },
        { status: 500 }
      );
    }

    // Send email with temporary password
    const emailResult = await resend.emails.send({
      from: labSender(lab),
      to: email,
      subject: "Your Temporary Poveon Dashboard Password",
      html: `
        <h2 style="color:#0259a0;margin-bottom:16px;">Temporary Password Set</h2>
        <p style="color:#4b5563;margin-bottom:16px;">
          An administrator has created a temporary password for your Poveon lab dashboard.
        </p>

        <div style="background:#f0f7ff;border:2px dashed #0270c3;border-radius:8px;padding:24px;text-align:center;margin:24px 0;">
          <p style="margin:0 0 6px;color:#0259a0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Temporary Password</p>
          <p style="margin:0;color:#0259a0;font-size:32px;font-weight:800;letter-spacing:2px;font-family:monospace;">${tempPassword}</p>
        </div>

        <p style="color:#4b5563;margin:24px 0;">
          <strong>Important:</strong> Please change this password immediately after logging in for security.
        </p>

        <p style="color:#4b5563;margin:12px 0;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://poveon.com"}/lab-login" style="color:#0259a0;text-decoration:none;font-weight:600;">Go to Lab Dashboard →</a>
        </p>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

        <p style="color:#6b7280;font-size:13px;margin:12px 0;">
          If you did not request this password reset, please contact your administrator.
        </p>
      `,
    });

    if (emailResult.error) {
      console.error("[set-temp-password] Email send failed:", emailResult.error);
      return NextResponse.json(
        {
          success: true,
          message: "Password set successfully but email failed to send. Please try resending.",
          temp_password: tempPassword,
          email_error: emailResult.error.message,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Temporary password created and sent to lab email",
      temp_password: tempPassword,
      email: email,
    });
  } catch (error) {
    console.error("[set-temp-password]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to set temporary password",
      },
      { status: 500 }
    );
  }
}
