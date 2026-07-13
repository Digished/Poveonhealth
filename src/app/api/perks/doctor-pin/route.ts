export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const Schema = z.object({
  email: z.string().email(),
  action: z.enum(["status", "verify"]),
  pin: z.string().optional(),
});

/**
 * POST /api/perks/doctor-pin
 * The login-code gate a doctor passes before sending a free ride:
 *  • action "status"  → { has_pin } so the UI knows whether to ask for a code or
 *                       start email-verified PIN creation
 *  • action "verify"  → check the 4-digit code against the doctor's login PIN
 *
 * verify starts a doctor portal session (cookie `doc_token`) so the code doubles
 * as logging in — the create route requires this session before it will redeem a
 * perk. Creating a PIN when the doctor has none is done via the email-OTP flow
 * (`/api/doc-login/send-otp` → `verify-otp` → `set-pin`), never here, so a login
 * code can only be created after verifying ownership of the email.
 */
export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400, headers: CORS_HEADERS });

  const email = parsed.data.email.trim().toLowerCase();
  const { action } = parsed.data;

  const profile = await prisma.doctorProfile.findUnique({ where: { email }, select: { pin_hash: true } });

  if (action === "status") {
    return NextResponse.json({ has_pin: !!profile?.pin_hash }, { headers: CORS_HEADERS });
  }

  // verify
  const pin = String(parsed.data.pin ?? "").trim();
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Your login code must be 4 digits." }, { status: 400, headers: CORS_HEADERS });
  }
  const pinHash = createHash("sha256").update(pin).digest("hex");

  if (!profile?.pin_hash) {
    return NextResponse.json({ error: "No login code set yet. Verify your email to create one.", needs_create: true }, { status: 404, headers: CORS_HEADERS });
  }
  if (profile.pin_hash !== pinHash) {
    return NextResponse.json({ error: "Incorrect login code." }, { status: 401, headers: CORS_HEADERS });
  }

  // Start a doctor session so the login code also signs the doctor in.
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await prisma.doctorSession.create({ data: { doctor_email: email, expires_at: expiresAt } });

  const res = NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  res.cookies.set("doc_token", session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return res;
}
