import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { hospitalOtpEmail } from "@/lib/email/templates";

const EmailSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = EmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    const normalised = parsed.data.email.trim().toLowerCase();

    // Only hospitals registered by an admin can log in
    const hospital = await prisma.hospital.findUnique({ where: { email: normalised } });
    if (!hospital || !hospital.is_active) {
      return NextResponse.json(
        { error: "No hospital account found for this email. Contact Poveon to get registered." },
        { status: 404 }
      );
    }

    // Rate-limit: max 3 pending (unused, non-expired) OTPs per email
    const recentCount = await prisma.hospitalOtp.count({
      where: { email: normalised, used: false, expires_at: { gt: new Date() } },
    });
    if (recentCount >= 3) {
      return NextResponse.json(
        { error: "Too many code requests. Please wait a few minutes before trying again." },
        { status: 429 }
      );
    }

    const otp = String(randomInt(100000, 999999));
    const codeHash = createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.hospitalOtp.create({
      data: { email: normalised, code_hash: codeHash, expires_at: expiresAt },
    });

    const emailResult = await resend.emails.send({
      from: FROM_ADDRESS,
      to: normalised,
      subject: "Your Poveon hospital login code",
      html: hospitalOtpEmail({ email: normalised, otp }),
    });

    if (emailResult.error) {
      console.error("[hospital-login/send-otp] Email send failed:", emailResult.error);
      return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[hospital-login/send-otp]", err);
    return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
  }
}
