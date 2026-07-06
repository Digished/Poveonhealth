import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { resend, FROM_ADDRESS } from "@/lib/email/resend";
import { hmoPatientOtpEmail } from "@/lib/email/templates";

const BodySchema = z.object({
  email: z.string().email(),
  policy_number: z.string().min(1).max(64),
});

// A generic success is returned even when the email/policy pair is not on
// any roster, so this endpoint can't be used to enumerate HMO members.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A valid email address and policy number are required." },
        { status: 400 }
      );
    }
    const email = parsed.data.email.trim().toLowerCase();
    const policyNumber = parsed.data.policy_number.trim();

    const member = await prisma.hmoMember.findFirst({
      where: {
        email,
        policy_number: { equals: policyNumber, mode: "insensitive" },
        active: true,
        hmo: { active: true },
      },
      include: { hmo: true },
      orderBy: { created_at: "desc" },
    });

    if (!member) {
      return NextResponse.json({ success: true });
    }

    // Rate-limit: max 3 pending (unused, non-expired) OTPs per email
    const recentCount = await prisma.patientOtp.count({
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
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.patientOtp.create({
      data: { email, code_hash: codeHash, expires_at: expiresAt },
    });

    const emailResult = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: "Your Poveon health monitoring login code",
      html: hmoPatientOtpEmail({ email, otp, hmoName: member.hmo.name }),
    });

    if (emailResult.error) {
      console.error("[hmo/send-otp] Email send failed:", emailResult.error);
      return NextResponse.json(
        { error: "Failed to send code. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[hmo/send-otp]", err);
    return NextResponse.json({ error: "Failed to send code. Please try again." }, { status: 500 });
  }
}
