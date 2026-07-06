import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const BodySchema = z.object({
  email: z.string().email(),
  policy_number: z.string().min(1).max(64),
});

// Tells the login page whether to show the PIN screen or fall back to an
// email code. Accounts are consolidated by email, so a member whose email
// already has a verified patient account (with a PIN) can use that same
// PIN here. Always answers hasPin so it can't be used to enumerate members.
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
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ hasPin: false });
    }

    const profile = await prisma.patientProfile.findUnique({
      where: { email },
      select: { pin_hash: true },
    });

    return NextResponse.json({ hasPin: !!profile?.pin_hash });
  } catch (err) {
    console.error("[hmo/check-pin]", err);
    return NextResponse.json({ error: "Failed to check." }, { status: 500 });
  }
}
