export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { carePlanOtpEmail } from "@/lib/email/templates";

const BodySchema = z.object({ email: z.string().email() });

/**
 * POST /api/pharmacy/send-otp — email a sign-in code to a partner pharmacy.
 * Reports success whether or not the address is a partner, so this can't be
 * used to enumerate the network.
 */
export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    const email = parsed.data.email.trim().toLowerCase();

    const pharmacy = await prisma.pharmacy.findUnique({ where: { email }, select: { id: true, active: true } });
    if (!pharmacy || !pharmacy.active) return NextResponse.json({ success: true });

    const pending = await prisma.pharmacyOtp.count({
      where: { email, used: false, expires_at: { gt: new Date() } },
    });
    if (pending >= 3) {
      return NextResponse.json(
        { error: "Too many code requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const otp = String(randomInt(100000, 999999));
    await prisma.pharmacyOtp.create({
      data: {
        email,
        code_hash: createHash("sha256").update(otp).digest("hex"),
        expires_at: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const sent = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Your Poveon pharmacy login code",
      html: carePlanOtpEmail({ email, otp, audience: "pharmacy" }),
    });
    if (sent.error) {
      console.error("[pharmacy/send-otp] email failed:", sent.error);
      return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pharmacy/send-otp]", err);
    return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
  }
}
