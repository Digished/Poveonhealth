export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdmin } from "@/lib/admin-auth";
import { sendWhatsAppMessage, isWhatsAppEnabled, isWhatsAppConfigured, toE164 } from "@/lib/whatsapp";
import { contentSidFor, type TemplateKey } from "@/lib/whatsapp/config";

/**
 * GET  /api/admin/whatsapp/test — report what's configured, without sending.
 * POST /api/admin/whatsapp/test — send a test WhatsApp message to a number.
 *
 * Useful for confirming credentials, the sandbox join, and template approval
 * before wiring a lab live.
 */

const TEMPLATE_KEYS: TemplateKey[] = [
  "requestCode",
  "doctorRequest",
  "resultsReady",
  "referralCreated",
  "referralStatus",
];

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    configured: isWhatsAppConfigured(),
    enabled: isWhatsAppEnabled(),
    account_sid_set: !!process.env.TWILIO_ACCOUNT_SID,
    sender_set: !!(process.env.TWILIO_WHATSAPP_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID),
    auth_token_set: !!process.env.TWILIO_AUTH_TOKEN,
    sms_fallback: process.env.WHATSAPP_SMS_FALLBACK !== "false",
    templates: Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, !!contentSidFor(k)])),
  });
}

const Schema = z.object({
  phone: z.string().min(5).max(50),
  message: z.string().min(1).max(1000).optional(),
});

export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  if (!isWhatsAppEnabled()) {
    return NextResponse.json(
      { error: "WhatsApp is not enabled — check TWILIO_ACCOUNT_SID, credentials, sender and WHATSAPP_ENABLED" },
      { status: 400 }
    );
  }

  const e164 = toE164(parsed.data.phone);
  if (!e164) return NextResponse.json({ error: "Could not parse that phone number" }, { status: 400 });

  const result = await sendWhatsAppMessage(
    e164,
    { body: parsed.data.message ?? "Poveon Health WhatsApp test message ✅" },
    { tag: "admin-test" }
  );

  return NextResponse.json(
    {
      success: result.ok,
      to: e164,
      message_id: result.messageId,
      status: result.status,
      error_code: result.errorCode,
      error: result.error,
      // 63016 here means credentials work but the recipient needs an approved
      // template (or must message the sender first to open the 24h window).
      hint:
        result.errorCode === 63016
          ? "Outside the 24-hour window. Have the recipient message your sender first, or configure an approved template SID."
          : undefined,
    },
    { status: result.ok ? 200 : 502 }
  );
}
