import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { doctorOtpEmail } from "@/lib/email/templates";

const EmailSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = EmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    const normalised = parsed.data.email.trim().toLowerCase();

    // Rate-limit: max 3 pending (unused, non-expired) OTPs per email in last 10 min
    const recentCount = await prisma.doctorOtp.count({
      where: {
        email: normalised,
        used: false,
        expires_at: { gt: new Date() },
      },
    });
    if (recentCount >= 3) {
      return NextResponse.json(
        { error: "Too many code requests. Please wait a few minutes before trying again." },
        { status: 429 }
      );
    }

    // Generate 6-digit OTP
    const otp = String(randomInt(100000, 999999));
    const codeHash = createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.doctorOtp.create({
      data: { email: normalised, code_hash: codeHash, expires_at: expiresAt },
    });

    // Send email
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: normalised,
      subject: "Your Poveon login code",
      html: doctorOtpEmail({ doctorEmail: normalised, otp }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/send-otp]", err);
    return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
  }
}
