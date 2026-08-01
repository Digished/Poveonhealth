export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature, formDataToParams } from "@/lib/whatsapp/twilio";

/**
 * Twilio WhatsApp delivery-receipt webhook.
 *
 * Set as the StatusCallback on every outbound message (see
 * `statusCallbackUrl()` in lib/whatsapp/config.ts), or configured in the Twilio
 * console under Messaging → Services → your service → Integration.
 *
 * Twilio POSTs form-encoded:
 *   MessageSid=SMxxxx&MessageStatus=delivered&To=whatsapp:%2B234...&ErrorCode=63016
 */

// Twilio message statuses → the values stored in sms_logs.status
const STATUS_MAP: Record<string, string> = {
  queued: "pending",
  accepted: "pending",
  scheduled: "pending",
  sending: "sent",
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
  undelivered: "failed",
  canceled: "failed",
};

/** Twilio signs the exact URL it was configured with — rebuild it from headers. */
function requestUrl(request: NextRequest): string {
  const explicit = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (explicit) return explicit;

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) return `${proto}://${host}${request.nextUrl.pathname}`;
  return request.nextUrl.href;
}

export async function POST(request: NextRequest) {
  try {
    const params = formDataToParams(await request.formData());

    const signature = request.headers.get("x-twilio-signature");
    if (!verifyTwilioSignature(requestUrl(request), params, signature)) {
      console.warn("[twilio-wa-webhook] Invalid or missing X-Twilio-Signature — rejecting");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const messageId = params.MessageSid || params.SmsSid || null;
    const rawStatus = (params.MessageStatus || params.SmsStatus || "").toLowerCase().trim();
    const dbStatus = STATUS_MAP[rawStatus] ?? "sent";
    const errorCode = params.ErrorCode || null;
    const errorMessage = params.ErrorMessage || null;

    console.log(`[twilio-wa-webhook] sid=${messageId} status="${rawStatus}" → "${dbStatus}"${errorCode ? ` code=${errorCode}` : ""}`);

    if (!messageId) {
      console.warn("[twilio-wa-webhook] Payload missing MessageSid — ignoring");
      return NextResponse.json({ success: true });
    }

    const updated = await prisma.smsLog.updateMany({
      where: { provider_msg_id: messageId, provider: "twilio_whatsapp" },
      data: {
        status: dbStatus,
        ...(errorCode ? { error_code: errorCode } : {}),
        ...(errorMessage ? { error_message: errorMessage } : {}),
        updated_at: new Date(),
      },
    });

    if (updated.count === 0) {
      // A message sent before logging existed, or a duplicate callback — not an error.
      console.warn(`[twilio-wa-webhook] No sms_log row for sid ${messageId}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[twilio-wa-webhook] Error:", error);
    // 200 so Twilio doesn't retry a payload we already failed to parse.
    return NextResponse.json({ success: true });
  }
}
