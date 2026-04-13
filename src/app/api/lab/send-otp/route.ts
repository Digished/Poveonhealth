import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { labOtpEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: z.string().email(),
  purpose: z.enum(["reset", "verify"]).default("reset"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    const { email: rawEmail, purpose } = parsed.data;
    const email = rawEmail.trim().toLowerCase();

    // Verify this email belongs to a lab account
    const adminSupabase = createAdminClient();
    const { data: users } = await adminSupabase.auth.admin.listUsers();
    const user = users?.users?.find(
      (u) => u.email?.toLowerCase() === email &&
        (u.user_metadata?.role === "lab" || u.user_metadata?.role === "lab_member")
    );
    if (!user) {
      // Don't reveal whether account exists — return success anyway
      return NextResponse.json({ success: true });
    }

    // Rate-limit: max 3 pending OTPs per email in last 10 min
    const recentCount = await prisma.labOtp.count({
      where: { email, used: false, expires_at: { gt: new Date() } },
    });
    if (recentCount >= 3) {
      return NextResponse.json(
        { error: "Too many code requests. Please wait a few minutes before trying again." },
        { status: 429 }
      );
    }

    const otp = String(randomInt(100000, 999999));
    const codeHash = createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.labOtp.create({ data: { email, code_hash: codeHash, purpose, expires_at: expiresAt } });

    const emailResult = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: purpose === "reset" ? "Your Poveon password reset code" : "Your Poveon verification code",
      html: labOtpEmail({ email, otp, purpose }),
    });

    if (emailResult.error) {
      console.error("[lab/send-otp] Email send failed:", emailResult.error);
      return NextResponse.json(
        { error: "Failed to send code. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lab/send-otp]", err);
    return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
  }
}
