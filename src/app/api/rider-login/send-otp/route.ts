import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { portalOtpEmail } from "@/lib/email/templates";

const EmailSchema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  try {
    const parsed = EmailSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    const email = parsed.data.email.trim().toLowerCase();

    const rider = await prisma.rider.findUnique({ where: { email } });
    if (!rider || !rider.is_active) {
      return NextResponse.json({ error: "No active rider account found for this email." }, { status: 404 });
    }

    const recentCount = await prisma.riderOtp.count({
      where: { email, used: false, expires_at: { gt: new Date() } },
    });
    if (recentCount >= 3) {
      return NextResponse.json({ error: "Too many code requests. Please wait a few minutes." }, { status: 429 });
    }

    const otp = String(randomInt(100000, 999999));
    const codeHash = createHash("sha256").update(otp).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.riderOtp.create({ data: { email, code_hash: codeHash, expires_at: expiresAt } });

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Your Poveon rider login code",
      html: portalOtpEmail({ email, otp, portalName: "Poveon rider app" }),
    });
    if (error) {
      console.error("[rider-login/send-otp]", error);
      return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[rider-login/send-otp]", err);
    return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
  }
}
