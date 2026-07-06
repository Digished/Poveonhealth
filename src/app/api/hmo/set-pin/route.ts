import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getHmoMemberFromRequest } from "@/lib/hmo/auth";

// Lets a signed-in HMO member create (or change) their 4-digit PIN.
// The PIN lives on the consolidated patient account (PatientProfile),
// so it also works on the patient portal — one account, one PIN.
export async function POST(req: NextRequest) {
  try {
    const auth = await getHmoMemberFromRequest(req);
    if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    const { member } = auth;

    const { pin } = await req.json();
    const trimmedPin = String(pin ?? "").trim();

    if (trimmedPin !== "" && !/^\d{4}$/.test(trimmedPin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const pinHash = trimmedPin ? createHash("sha256").update(trimmedPin).digest("hex") : null;

    await prisma.patientProfile.upsert({
      where: { email: member.email },
      create: {
        email: member.email,
        name: member.full_name,
        phone: member.phone,
        dob: member.date_of_birth,
        sex: member.sex,
        pin_hash: pinHash,
      },
      update: { pin_hash: pinHash },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[hmo/set-pin]", err);
    return NextResponse.json({ error: "Failed to update PIN." }, { status: 500 });
  }
}
