import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/** Verify a DoctorOtp without creating a session — used for in-dashboard identity checks (e.g. PIN change). */
export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
    }
    const normalised = email.trim().toLowerCase();
    const trimmedCode = String(code).trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      return NextResponse.json({ error: "Code must be a 6-digit number." }, { status: 400 });
    }
    const codeHash = createHash("sha256").update(trimmedCode).digest("hex");
    const otp = await prisma.doctorOtp.findFirst({
      where: { email: normalised, code_hash: codeHash, used: false, expires_at: { gt: new Date() } },
      orderBy: { created_at: "desc" },
    });
    if (!otp) {
      return NextResponse.json({ error: "Invalid or expired code. Please request a new one." }, { status: 401 });
    }
    await prisma.doctorOtp.update({ where: { id: otp.id }, data: { used: true } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[doc-login/check-otp]", err);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
