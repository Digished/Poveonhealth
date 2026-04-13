import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { marketerOtpEmail } from "@/lib/email/templates";

const EmailSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = EmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    const normalised = parsed.data.email.trim().toLowerCase();

    const marketer = await prisma.marketer.findUnique({ where: { email: normalised } });
    if (!marketer) {
      return NextResponse.json(
        { error: "No marketer account found with that email address. Please contact your administrator." },
        { status: 404 }
      );
    }

    if (marketer.suspended) {
      return NextResponse.json(
        { error: "Your account has been suspended. Please contact your administrator." },
        { status: 403 }
      );
    }

    // Rate-limit: max 3 pending (unused, non-expired) OTPs per marketer in last 10 min
    const recentCount = await prisma.marketerOtp.count({
      where: {
        marketer_id: marketer.id,
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

    const otp = String(randomInt(100000, 999999));
    const codeHash = createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.marketerOtp.create({
      data: { marketer_id: marketer.id, code_hash: codeHash, expires_at: expiresAt },
    });

    const emailResult = await resend.emails.send({
      from: FROM_ADDRESS,
      to: normalised,
      subject: "Your Poveon login code",
      html: marketerOtpEmail({ marketerName: marketer.name, marketerEmail: normalised, otp }),
    });

    if (emailResult.error) {
      console.error("[scale/send-otp] Email send failed:", emailResult.error);
      return NextResponse.json(
        { error: "Failed to send code. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[scale/send-otp]", err);
    return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
  }
}
